import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OpenAIHelper } from './openai-helper.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecipeSearchParams {
  query?: string;           // free-text (name, ingredient, cuisine)
  dietaryTags?: string[];
  allergies?: string[];
  excludeIngredients?: string[];
  maxCalories?: number;
  minProtein?: number;
  maxTime?: number;
  cuisine?: string;
  meal?: string;
  limit?: number;
  offset?: number;
}

export interface RecipeDetail {
  id: string;
  title: string;
  cuisine: string;
  meal: string;
  servings: number;
  summary: string;
  time: number;
  difficultyLevel: string;
  dietaryTags: string[];
  source: string;
  img: string | null;
  ingredients: { id: string; ingredientId: string; label: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fats: number }[];
  preparation: { stepNumber: number; step: string; description: string; ingredientIds: string[] }[];
  nutrition: { calories: number; protein: number; carbs: number; fats: number };
}

@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIHelper,
  ) {}

  // ────────── RAG: vector similarity search ──────────

  async searchByVector(query: string, limit = 10): Promise<any[]> {
    const embedding = await this.openai.embedding(query);
    const vec = `[${embedding.join(',')}]`;

    const results: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, title, cuisine, meal, servings, summary, time, difficulty_level AS "difficultyLevel",
              dietary_tags AS "dietaryTags", source, img,
              1 - (embedding <=> $1::vector) AS similarity
       FROM recipes
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vec,
      limit,
    );

    return results;
  }

  // ────────── Search & filter (combined SQL + vector) ──────────

  async search(params: RecipeSearchParams): Promise<{ recipes: any[]; total: number }> {
    const limit = Math.min(params.limit || 20, 100);
    const offset = params.offset || 0;

    // If there's a free-text query, use vector similarity
    if (params.query && params.query.trim()) {
      const vectorResults = await this.searchByVector(params.query, 100);
      let filtered = vectorResults;

      if (params.dietaryTags?.length) {
        filtered = filtered.filter((r) =>
          params.dietaryTags!.every((tag) => r.dietaryTags?.includes(tag)),
        );
      }
      if (params.cuisine) {
        filtered = filtered.filter((r) => r.cuisine.toLowerCase() === params.cuisine!.toLowerCase());
      }
      if (params.meal) {
        filtered = filtered.filter((r) => r.meal.toLowerCase() === params.meal!.toLowerCase());
      }
      if (params.maxTime) {
        filtered = filtered.filter((r) => r.time <= params.maxTime!);
      }

      return { recipes: filtered.slice(offset, offset + limit), total: filtered.length };
    }

    // Prisma query for non-vector search
    const where: any = {};
    if (params.cuisine) where.cuisine = { equals: params.cuisine, mode: 'insensitive' };
    if (params.meal) where.meal = { equals: params.meal, mode: 'insensitive' };
    if (params.maxTime) where.time = { lte: params.maxTime };
    if (params.dietaryTags?.length) where.dietaryTags = { hasEvery: params.dietaryTags };

    const [recipes, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ingredients: { include: { ingredient: true } },
        },
      }),
      this.prisma.recipe.count({ where }),
    ]);

    return { recipes, total };
  }

  // ────────── Get full recipe detail ──────────

  async getById(id: string): Promise<RecipeDetail> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: { include: { ingredient: true } },
        preparation: { orderBy: { stepNumber: 'asc' } },
      },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');

    const ingredients = recipe.ingredients.map((ri) => ({
      id: ri.id,
      ingredientId: ri.ingredientId,
      label: ri.ingredient.label,
      quantity: ri.quantity,
      unit: ri.ingredient.unit,
      calories: (ri.ingredient.calories / ri.ingredient.quantity) * ri.quantity,
      protein: (ri.ingredient.protein / ri.ingredient.quantity) * ri.quantity,
      carbs: (ri.ingredient.carbs / ri.ingredient.quantity) * ri.quantity,
      fats: (ri.ingredient.fats / ri.ingredient.quantity) * ri.quantity,
    }));

    const nutrition = {
      calories: ingredients.reduce((s, i) => s + i.calories, 0),
      protein: ingredients.reduce((s, i) => s + i.protein, 0),
      carbs: ingredients.reduce((s, i) => s + i.carbs, 0),
      fats: ingredients.reduce((s, i) => s + i.fats, 0),
    };

    return {
      id: recipe.id,
      title: recipe.title,
      cuisine: recipe.cuisine,
      meal: recipe.meal,
      servings: recipe.servings,
      summary: recipe.summary,
      time: recipe.time,
      difficultyLevel: recipe.difficultyLevel,
      dietaryTags: recipe.dietaryTags,
      source: recipe.source,
      img: recipe.img,
      ingredients,
      preparation: recipe.preparation.map((s) => ({
        stepNumber: s.stepNumber,
        step: s.step,
        description: s.description,
        ingredientIds: s.ingredientIds,
      })),
      nutrition,
    };
  }

  // ────────── RAG recipe generation ──────────

  async generateRecipe(preferences: {
    dietaryTags?: string[];
    cuisine?: string;
    meal?: string;
    allergies?: string[];
    dislikedIngredients?: string[];
    calorieTarget?: number;
    proteinTarget?: number;
  }): Promise<RecipeDetail> {
    // Step 1: Build a search query from preferences
    const searchTerms = [
      preferences.cuisine,
      preferences.meal,
      ...(preferences.dietaryTags || []),
    ].filter(Boolean).join(' ');

    // Step 2: Retrieve similar recipes from RAG database
    const similar = await this.searchByVector(
      searchTerms || 'healthy balanced meal',
      5,
    );

    // Step 3: Augment prompt with retrieved recipes
    const ragContext = similar
      .map((r) => `- "${r.title}" (${r.cuisine}, ${r.meal}): ${r.summary}`)
      .join('\n');

    const allergyClause = preferences.allergies?.length
      ? `MUST NOT contain: ${preferences.allergies.join(', ')}.`
      : '';
    const dislikedClause = preferences.dislikedIngredients?.length
      ? `Avoid these ingredients: ${preferences.dislikedIngredients.join(', ')}.`
      : '';
    const calorieClause = preferences.calorieTarget
      ? `Target around ${preferences.calorieTarget} kcal per serving.`
      : '';

    const prompt = `Generate a unique ${preferences.cuisine || ''} ${preferences.meal || 'meal'} recipe.
Dietary tags: ${(preferences.dietaryTags || []).join(', ') || 'none specific'}.
${allergyClause}
${dislikedClause}
${calorieClause}

Here are similar recipes for inspiration (do NOT copy, create something new):
${ragContext}

Return ONLY valid JSON:
{
  "title": "Recipe Title",
  "cuisine": "cuisine",
  "meal": "${preferences.meal || 'dinner'}",
  "servings": 2-4,
  "summary": "1-2 sentences",
  "time": minutes,
  "difficultyLevel": "easy|medium|hard",
  "dietaryTags": ["tags"],
  "ingredients": [{"label": "name (lowercase)", "quantity": grams_or_ml, "unit": "gram|ml"}],
  "preparation": [{"step": "Title", "description": "Detail", "ingredientLabels": ["labels"]}]
}
Quantities: solids in grams, liquids in ml.`;

    const raw = await this.openai.chatText(prompt, 'You are a professional chef and nutritionist. Return only valid JSON.', 0.8);
    const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Step 4: Save to database
    return this.saveGeneratedRecipe(parsed);
  }

  // ────────── Ingredient substitution ──────────

  async substituteIngredient(
    recipeId: string,
    ingredientId: string,
    reason?: string,
  ): Promise<RecipeDetail> {
    const recipe = await this.getById(recipeId);
    const ingToReplace = recipe.ingredients.find((i) => i.ingredientId === ingredientId);
    if (!ingToReplace) throw new NotFoundException('Ingredient not in this recipe');

    const prompt = `Suggest a substitute for "${ingToReplace.label}" (${ingToReplace.quantity}${ingToReplace.unit}) in recipe "${recipe.title}".
${reason ? `Reason: ${reason}` : ''}
Other ingredients: ${recipe.ingredients.filter((i) => i.ingredientId !== ingredientId).map((i) => i.label).join(', ')}.
Return ONLY JSON: {"label": "substitute name (lowercase)", "quantity": number, "unit": "gram|ml", "explanation": "why this works"}`;

    const raw = await this.openai.chatText(prompt, 'You are a nutrition expert.', 0.6);
    const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const sub = JSON.parse(cleaned);

    // Find or create the substitute ingredient
    let subIngredient = await this.prisma.ingredient.findUnique({ where: { label: sub.label.toLowerCase() } });
    if (!subIngredient) {
      subIngredient = await this.prisma.ingredient.create({
        data: {
          label: sub.label.toLowerCase(),
          unit: sub.unit === 'ml' ? 'ml' : 'gram',
          quantity: 100,
          calories: 0, carbs: 0, protein: 0, fats: 0,
        },
      });
    }

    // Replace in the join table
    await this.prisma.recipeIngredient.deleteMany({
      where: { recipeId, ingredientId },
    });
    await this.prisma.recipeIngredient.create({
      data: {
        recipeId,
        ingredientId: subIngredient.id,
        quantity: sub.quantity,
      },
    });

    return this.getById(recipeId);
  }

  // ────────── Portion adjustment ──────────

  async adjustPortions(recipeId: string, newServings: number): Promise<RecipeDetail> {
    const recipe = await this.getById(recipeId);
    const factor = newServings / recipe.servings;

    return {
      ...recipe,
      servings: newServings,
      ingredients: recipe.ingredients.map((i) => ({
        ...i,
        quantity: Math.round(i.quantity * factor * 10) / 10,
        calories: i.calories * factor,
        protein: i.protein * factor,
        carbs: i.carbs * factor,
        fats: i.fats * factor,
      })),
      nutrition: {
        calories: recipe.nutrition.calories * factor,
        protein: recipe.nutrition.protein * factor,
        carbs: recipe.nutrition.carbs * factor,
        fats: recipe.nutrition.fats * factor,
      },
    };
  }

  // ────────── Save a generated recipe ──────────

  private async saveGeneratedRecipe(data: any): Promise<RecipeDetail> {
    // Generate embedding for the new recipe
    const embText = `${data.title} - ${data.cuisine} ${data.meal}. ${data.summary}. Ingredients: ${data.ingredients.map((i: any) => i.label).join(', ')}. Tags: ${(data.dietaryTags || []).join(', ')}.`;
    const emb = await this.openai.embedding(embText);
    const vec = `[${emb.join(',')}]`;

    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `INSERT INTO recipes (id, title, cuisine, meal, servings, summary, time, difficulty_level, dietary_tags, source, embedding, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'ai-generated', $9::vector, NOW(), NOW())
       RETURNING id`,
      data.title,
      data.cuisine,
      data.meal || 'dinner',
      data.servings || 2,
      data.summary,
      data.time || 30,
      data.difficultyLevel || 'medium',
      data.dietaryTags || [],
      vec,
    );
    const recipeId = rows[0].id;

    // Link ingredients
    for (const ing of data.ingredients) {
      const label = ing.label.toLowerCase();
      let ingredient = await this.prisma.ingredient.findUnique({ where: { label } });
      if (!ingredient) {
        ingredient = await this.prisma.ingredient.create({
          data: { label, unit: ing.unit === 'ml' ? 'ml' : 'gram', quantity: 100, calories: 0, carbs: 0, protein: 0, fats: 0 },
        });
      }
      await this.prisma.$executeRaw`
        INSERT INTO recipe_ingredients (id, "recipeId", "ingredientId", quantity)
        VALUES (gen_random_uuid(), ${recipeId}, ${ingredient.id}, ${ing.quantity})
        ON CONFLICT ("recipeId", "ingredientId") DO NOTHING
      `;
    }

    // Steps
    const steps = data.preparation || [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      await this.prisma.recipeStep.create({
        data: {
          recipeId,
          stepNumber: i + 1,
          step: s.step,
          description: s.description,
          ingredientIds: s.ingredientLabels || [],
        },
      });
    }

    return this.getById(recipeId);
  }
}
