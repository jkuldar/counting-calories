/**
 * Seed script: generates 500+ recipes and 500+ ingredients with vector embeddings.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... DATABASE_URL=postgresql://... npx ts-node prisma/seed.ts
 *
 * The script is idempotent — it skips ingredients/recipes that already exist
 * (matched by label / title).  It works in batches to stay within OpenAI rate limits.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// OpenAI helpers
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536 dims
const CHAT_MODEL = 'gpt-4.1-mini';

async function openaiChat(messages: { role: string; content: string }[], temperature = 0.8, maxTokens = 4096): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI chat error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
}

async function openaiEmbeddings(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embedding error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.data as { embedding: number[] }[])
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Ingredient generation
// ---------------------------------------------------------------------------

const INGREDIENT_CATEGORIES = [
  'vegetables', 'fruits', 'grains and cereals', 'legumes and beans',
  'nuts and seeds', 'dairy and eggs', 'meat and poultry',
  'fish and seafood', 'oils and fats', 'herbs and spices',
  'condiments and sauces', 'sweeteners', 'beverages base ingredients',
  'baking essentials', 'plant-based proteins',
];

interface RawIngredient {
  label: string;
  unit: 'gram' | 'ml';
  quantity: number;
  calories: number;
  carbs: number;
  protein: number;
  fats: number;
}

async function generateIngredientBatch(category: string, count: number): Promise<RawIngredient[]> {
  const prompt = `Generate exactly ${count} common cooking ingredients in the category "${category}".
For each ingredient provide nutritional data per 100g (or 100ml for liquids).
Return ONLY a valid JSON array (no markdown fences). Each element:
{
  "label": "ingredient name (lowercase)",
  "unit": "gram" or "ml",
  "quantity": 100,
  "calories": number (kcal),
  "carbs": number (grams),
  "protein": number (grams),
  "fats": number (grams)
}
Use realistic USDA-like nutritional values. No duplicates. No explanatory text.`;

  const raw = await openaiChat([{ role: 'user', content: prompt }], 0.4, 4096);
  try {
    const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as RawIngredient[];
  } catch {
    console.error(`  ⚠ Failed to parse ingredient batch for "${category}", retrying…`);
    await sleep(2000);
    const raw2 = await openaiChat([{ role: 'user', content: prompt + '\nIMPORTANT: Return ONLY the JSON array, nothing else.' }], 0.3, 4096);
    const cleaned2 = raw2.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned2) as RawIngredient[];
  }
}

// ---------------------------------------------------------------------------
// Recipe generation
// ---------------------------------------------------------------------------

const CUISINES = [
  'Italian', 'Mexican', 'Japanese', 'Indian', 'Thai',
  'Mediterranean', 'Chinese', 'French', 'Korean', 'American',
  'Middle Eastern', 'Greek', 'Vietnamese', 'Spanish', 'Ethiopian',
  'Brazilian', 'Turkish', 'British', 'Caribbean', 'Moroccan',
];

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const DIETARY_TAGS_POOL = [
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto',
  'low-carb', 'high-protein', 'paleo', 'whole30', 'nut-free',
  'soy-free', 'egg-free', 'low-sodium', 'low-fat', 'pescatarian',
  'sugar-free', 'mediterranean', 'anti-inflammatory',
];

interface RawRecipeIngredient {
  label: string;
  quantity: number;
  unit: string;
}

interface RawRecipeStep {
  step: string;
  description: string;
  ingredientLabels: string[];
}

interface RawRecipe {
  title: string;
  cuisine: string;
  meal: string;
  servings: number;
  summary: string;
  time: number;
  difficultyLevel: string;
  dietaryTags: string[];
  ingredients: RawRecipeIngredient[];
  preparation: RawRecipeStep[];
}

async function generateRecipeBatch(cuisine: string, mealType: string, count: number, existingIngredientLabels: string[]): Promise<RawRecipe[]> {
  const sampleIngredients = existingIngredientLabels
    .sort(() => Math.random() - 0.5)
    .slice(0, 60)
    .join(', ');

  const prompt = `Generate exactly ${count} unique ${cuisine} ${mealType} recipes.
Use ingredients from this pool when possible (but you may add others): ${sampleIngredients}

Return ONLY a valid JSON array. Each element:
{
  "title": "Recipe Title",
  "cuisine": "${cuisine}",
  "meal": "${mealType}",
  "servings": 2-6,
  "summary": "1-2 sentence description",
  "time": preparation time in minutes (10-120),
  "difficultyLevel": "easy"|"medium"|"hard",
  "dietaryTags": ["tags from: ${DIETARY_TAGS_POOL.join(', ')}"],
  "ingredients": [
    {"label": "ingredient name (lowercase)", "quantity": number in grams or ml, "unit": "gram"|"ml"}
  ],
  "preparation": [
    {"step": "Step title", "description": "Detailed instruction", "ingredientLabels": ["ingredient labels used"]}
  ]
}
Requirements:
- All quantities in grams (solids) or ml (liquids)
- Realistic preparation times
- 3-12 ingredients per recipe
- 3-8 preparation steps
- Varied difficulty levels
- No markdown fences, only JSON`;

  const raw = await openaiChat([{ role: 'user', content: prompt }], 0.8, 4096);
  try {
    const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as RawRecipe[];
  } catch {
    console.error(`  ⚠ Failed to parse recipe batch (${cuisine} ${mealType}), retrying…`);
    await sleep(2000);
    const raw2 = await openaiChat([{ role: 'user', content: prompt + '\nIMPORTANT: Return ONLY the JSON array.' }], 0.7, 4096);
    const cleaned2 = raw2.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned2) as RawRecipe[];
  }
}

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function seedIngredients(): Promise<Map<string, string>> {
  console.log('\n🌱 Seeding ingredients…');
  const labelToId = new Map<string, string>();

  // Load existing
  const existing = await prisma.ingredient.findMany({ select: { id: true, label: true } });
  for (const ing of existing) labelToId.set(ing.label.toLowerCase(), ing.id);
  console.log(`  Found ${existing.length} existing ingredients`);

  const target = 550;
  if (labelToId.size >= target) {
    console.log(`  Already have ${labelToId.size} ingredients, skipping generation`);
    return labelToId;
  }

  const needed = target - labelToId.size;
  const perCategory = Math.ceil(needed / INGREDIENT_CATEGORIES.length);

  for (const category of INGREDIENT_CATEGORIES) {
    if (labelToId.size >= target) break;
    console.log(`  Generating ${perCategory} ingredients for "${category}"…`);
    try {
      const batch = await generateIngredientBatch(category, perCategory);
      const newOnes = batch.filter((i) => !labelToId.has(i.label.toLowerCase()));
      if (newOnes.length === 0) continue;

      // Generate embeddings
      const texts = newOnes.map((i) => `${i.label} - ${category} ingredient, ${i.calories} kcal, ${i.protein}g protein, ${i.carbs}g carbs, ${i.fats}g fat per 100${i.unit === 'ml' ? 'ml' : 'g'}`);
      const embeddings = await openaiEmbeddings(texts);

      // Insert into DB
      for (let j = 0; j < newOnes.length; j++) {
        const ing = newOnes[j];
        const vec = `[${embeddings[j].join(',')}]`;
        try {
          const record: any = await prisma.$queryRaw`
            INSERT INTO ingredients (id, label, unit, quantity, calories, carbs, protein, fats, embedding, "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${ing.label.toLowerCase()}, ${ing.unit}, ${ing.quantity}, ${ing.calories}, ${ing.carbs}, ${ing.protein}, ${ing.fats}, ${vec}::vector, NOW(), NOW())
            ON CONFLICT (label) DO NOTHING
            RETURNING id, label
          `;
          if (record && (record as any[]).length > 0) {
            labelToId.set((record as any[])[0].label.toLowerCase(), (record as any[])[0].id);
          }
        } catch (e: any) {
          if (!e.message?.includes('unique')) console.error(`    ⚠ Error inserting ${ing.label}:`, e.message);
        }
      }
      console.log(`  ✓ ${category}: inserted ${newOnes.length} ingredients (total: ${labelToId.size})`);
    } catch (e: any) {
      console.error(`  ✗ Failed category "${category}":`, e.message);
    }
    await sleep(1000); // Rate limit buffer
  }

  // Reload all from DB to ensure map is complete
  const all = await prisma.ingredient.findMany({ select: { id: true, label: true } });
  labelToId.clear();
  for (const ing of all) labelToId.set(ing.label.toLowerCase(), ing.id);
  console.log(`  ✅ Total ingredients: ${labelToId.size}`);
  return labelToId;
}

async function seedRecipes(ingredientMap: Map<string, string>): Promise<void> {
  console.log('\n🍽️  Seeding recipes…');

  const existingCount = await prisma.recipe.count();
  console.log(`  Found ${existingCount} existing recipes`);

  const target = 550;
  if (existingCount >= target) {
    console.log(`  Already have ${existingCount} recipes, skipping generation`);
    return;
  }

  const needed = target - existingCount;
  const existingTitles = new Set(
    (await prisma.recipe.findMany({ select: { title: true } })).map((r) => r.title.toLowerCase()),
  );

  const ingredientLabels = [...ingredientMap.keys()];
  // Generate recipes across cuisines and meal types
  const combos: { cuisine: string; meal: string }[] = [];
  for (const cuisine of CUISINES) {
    for (const meal of MEAL_TYPES) {
      combos.push({ cuisine, meal });
    }
  }

  // Shuffle to get variety
  combos.sort(() => Math.random() - 0.5);

  let inserted = 0;
  const recipesPerBatch = 5;

  for (const combo of combos) {
    if (inserted >= needed) break;

    console.log(`  Generating ${recipesPerBatch} ${combo.cuisine} ${combo.meal} recipes…`);
    try {
      const batch = await generateRecipeBatch(combo.cuisine, combo.meal, recipesPerBatch, ingredientLabels);
      const newRecipes = batch.filter((r) => !existingTitles.has(r.title.toLowerCase()));

      for (const recipe of newRecipes) {
        if (inserted >= needed) break;
        try {
          // Build embedding text
          const embeddingText = `${recipe.title} - ${recipe.cuisine} ${recipe.meal}. ${recipe.summary}. Ingredients: ${recipe.ingredients.map((i) => i.label).join(', ')}. Tags: ${recipe.dietaryTags.join(', ')}. ${recipe.time} minutes, ${recipe.difficultyLevel}.`;
          const [embedding] = await openaiEmbeddings([embeddingText]);
          const vec = `[${embedding.join(',')}]`;

          // Create recipe with raw SQL for vector field
          const recipeRows: any[] = await prisma.$queryRaw`
            INSERT INTO recipes (id, title, cuisine, meal, servings, summary, time, difficulty_level, dietary_tags, source, embedding, "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${recipe.title}, ${recipe.cuisine}, ${recipe.meal}, ${recipe.servings}, ${recipe.summary}, ${recipe.time}, ${recipe.difficultyLevel}, ${recipe.dietaryTags}, 'rag-database', ${vec}::vector, NOW(), NOW())
            RETURNING id
          `;

          const recipeId = recipeRows[0].id;

          // Link ingredients
          for (const ing of recipe.ingredients) {
            const label = ing.label.toLowerCase();
            let ingredientId = ingredientMap.get(label);

            // Auto-create ingredient if missing
            if (!ingredientId) {
              try {
                const created = await prisma.ingredient.create({
                  data: {
                    label,
                    unit: ing.unit === 'ml' ? 'ml' : 'gram',
                    quantity: 100,
                    calories: 0,
                    carbs: 0,
                    protein: 0,
                    fats: 0,
                  },
                });
                ingredientId = created.id;
                ingredientMap.set(label, ingredientId);
              } catch {
                // Might exist from another concurrent insert
                const found = await prisma.ingredient.findUnique({ where: { label } });
                if (found) {
                  ingredientId = found.id;
                  ingredientMap.set(label, ingredientId);
                } else {
                  continue;
                }
              }
            }

            await prisma.$executeRaw`
              INSERT INTO recipe_ingredients (id, "recipeId", "ingredientId", quantity)
              VALUES (gen_random_uuid(), ${recipeId}, ${ingredientId}, ${ing.quantity})
              ON CONFLICT ("recipeId", "ingredientId") DO NOTHING
            `;
          }

          // Insert preparation steps
          for (let s = 0; s < recipe.preparation.length; s++) {
            const step = recipe.preparation[s];
            const ingredientIds = (step.ingredientLabels || [])
              .map((l: string) => ingredientMap.get(l.toLowerCase()))
              .filter(Boolean) as string[];

            await prisma.recipeStep.create({
              data: {
                recipeId,
                stepNumber: s + 1,
                step: step.step,
                description: step.description,
                ingredientIds,
              },
            });
          }

          existingTitles.add(recipe.title.toLowerCase());
          inserted++;
          console.log(`    ✓ ${recipe.title} (${inserted}/${needed})`);
        } catch (e: any) {
          console.error(`    ✗ Failed recipe "${recipe.title}":`, e.message);
        }
      }
    } catch (e: any) {
      console.error(`  ✗ Failed batch (${combo.cuisine} ${combo.meal}):`, e.message);
    }
    await sleep(1500); // Rate limit buffer
  }

  const finalCount = await prisma.recipe.count();
  console.log(`  ✅ Total recipes: ${finalCount}`);
}

async function rebuildVectorIndexes(): Promise<void> {
  console.log('\n🔍 Rebuilding vector indexes…');
  try {
    // Drop and recreate IVFFlat indexes (they need data to build properly)
    await prisma.$executeRaw`DROP INDEX IF EXISTS recipes_embedding_idx`;
    await prisma.$executeRaw`DROP INDEX IF EXISTS ingredients_embedding_idx`;

    const ingredientCount = await prisma.ingredient.count();
    const recipeCount = await prisma.recipe.count();

    // IVFFlat lists should be sqrt(n) approximately
    const ingLists = Math.max(1, Math.min(100, Math.floor(Math.sqrt(ingredientCount))));
    const recLists = Math.max(1, Math.min(100, Math.floor(Math.sqrt(recipeCount))));

    await prisma.$executeRawUnsafe(`CREATE INDEX recipes_embedding_idx ON recipes USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${recLists})`);
    await prisma.$executeRawUnsafe(`CREATE INDEX ingredients_embedding_idx ON ingredients USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${ingLists})`);
    console.log(`  ✅ Vector indexes rebuilt (recipes: ${recLists} lists, ingredients: ${ingLists} lists)`);
  } catch (e: any) {
    console.error('  ⚠ Index rebuild failed (may need more data):', e.message);
  }
}

async function main() {
  console.log('🚀 Starting seed…');
  console.log(`  Database: ${process.env.DATABASE_URL?.replace(/\/\/.*:.*@/, '//***:***@') ?? '(not set)'}`);
  console.log(`  OpenAI model: ${CHAT_MODEL}  |  Embedding model: ${EMBEDDING_MODEL}`);

  try {
    const ingredientMap = await seedIngredients();
    await seedRecipes(ingredientMap);
    await rebuildVectorIndexes();
    console.log('\n✅ Seed complete!');
  } catch (e) {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
