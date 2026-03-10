import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OpenAIHelper } from './openai-helper.service';
import { RecipeService } from './recipe.service';
import { NutritionService } from './nutrition.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MealPlanRequest {
  duration: 'daily' | 'weekly';
  startDate: string; // ISO 8601 date string
  mealsPerDay?: number;
  snacksPerDay?: number;
}

export interface MealPlanResult {
  id: string;
  duration: string;
  startDate: string;
  endDate: string;
  version: number;
  isActive: boolean;
  meals: MealPlanMealResult[];
  createdAt: string;
}

export interface MealPlanMealResult {
  id: string;
  date: string;
  mealType: string;
  mealTime: string | null;
  sortOrder: number;
  recipeId: string | null;
  recipe?: any;
  customName: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  servings: number;
  isManual: boolean;
}

@Injectable()
export class MealPlanningService {
  private readonly logger = new Logger(MealPlanningService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIHelper,
    private recipeService: RecipeService,
    private nutritionService: NutritionService,
  ) {}

  // ────────── Sequential prompting: 3-step meal plan generation ──────────

  async generateMealPlan(userId: string, request: MealPlanRequest): Promise<MealPlanResult> {
    // Load user preferences & health profile
    const [prefs, healthProfile] = await Promise.all([
      this.prisma.mealPlanPreferences.findUnique({ where: { userId } }),
      this.prisma.healthProfile.findUnique({ where: { userId } }),
    ]);

    const mealsPerDay = request.mealsPerDay ?? prefs?.mealsPerDay ?? 3;
    const snacksPerDay = request.snacksPerDay ?? prefs?.snacksPerDay ?? 0;
    const totalMealsPerDay = mealsPerDay + snacksPerDay;

    const dietaryPrefs = healthProfile?.dietaryPreferences || [];
    const allergies = healthProfile?.allergies || [];
    const restrictions = healthProfile?.restrictions || [];
    const calorieTarget = prefs?.calorieTarget || this.estimateCalorieTarget(healthProfile);
    const proteinTarget = prefs?.proteinTarget;
    const carbsTarget = prefs?.carbsTarget;
    const fatsTarget = prefs?.fatsTarget;

    const dayCount = request.duration === 'weekly' ? 7 : 1;
    const startDate = new Date(request.startDate + 'T00:00:00Z');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dayCount - 1);

    const userContext = {
      dietaryPreferences: dietaryPrefs,
      allergies,
      restrictions,
      dislikedIngredients: prefs?.dislikedIngredients || [],
      cuisinePreferences: prefs?.cuisinePreferences || [],
      calorieTarget,
      macroTargets: { protein: proteinTarget, carbs: carbsTarget, fats: fatsTarget },
      mealsPerDay,
      snacksPerDay,
      mealTimes: {
        breakfast: prefs?.breakfastTime || '08:00',
        lunch: prefs?.lunchTime || '12:30',
        dinner: prefs?.dinnerTime || '19:00',
        snack: prefs?.snackTime || '15:00',
      },
    };

    // ──── STEP 1: Strategy Assessment ────
    this.logger.log(`[MealPlan] Step 1: Strategy assessment for user ${userId}`);
    const strategy = await this.stepOneStrategy(userContext, dayCount);

    // ──── STEP 2: Meal Structure (using RAG) ────
    this.logger.log(`[MealPlan] Step 2: Meal structure with RAG`);
    const mealStructure = await this.stepTwoMealStructure(strategy, userContext, dayCount, totalMealsPerDay);

    // ──── STEP 3: Nutritional Analysis & Refinement ────
    this.logger.log(`[MealPlan] Step 3: Nutritional analysis & refinement`);
    const refinedMeals = await this.stepThreeRefine(mealStructure, userContext, dayCount);

    // ──── Save the plan ────

    // Deactivate previous active plans for the same date range
    await this.prisma.mealPlan.updateMany({
      where: { userId, isActive: true, startDate: { lte: endDate }, endDate: { gte: startDate } },
      data: { isActive: false },
    });

    // Determine version number
    const prevVersions = await this.prisma.mealPlan.count({
      where: { userId, startDate, endDate },
    });

    const mealPlan = await this.prisma.mealPlan.create({
      data: {
        userId,
        duration: request.duration,
        startDate,
        endDate,
        version: prevVersions + 1,
        isActive: true,
        preferencesSnapshot: userContext as any,
        meals: {
          create: refinedMeals.map((m: any, idx: number) => ({
            date: new Date(m.date + 'T00:00:00Z'),
            mealType: m.mealType,
            mealTime: m.mealTime || null,
            sortOrder: idx,
            recipeId: m.recipeId || null,
            customName: m.customName || null,
            calories: m.calories || null,
            protein: m.protein || null,
            carbs: m.carbs || null,
            fats: m.fats || null,
            servings: m.servings || 1,
            isManual: false,
          })),
        },
      },
      include: {
        meals: { include: { recipe: true }, orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }] },
      },
    });

    return this.formatMealPlan(mealPlan);
  }

  // ──── Step 1: Strategy Assessment ────
  private async stepOneStrategy(ctx: any, dayCount: number): Promise<string> {
    const prompt = `Analyze this user profile and recommend a ${dayCount}-day meal plan strategy.

User Profile:
- Dietary preferences: ${ctx.dietaryPreferences.join(', ') || 'none'}
- Allergies: ${ctx.allergies.join(', ') || 'none'}
- Restrictions: ${ctx.restrictions.join(', ') || 'none'}
- Disliked ingredients: ${ctx.dislikedIngredients.join(', ') || 'none'}
- Cuisine preferences: ${ctx.cuisinePreferences.join(', ') || 'varied'}
- Calorie target: ${ctx.calorieTarget} kcal/day
- Macro targets: protein ${ctx.macroTargets.protein || 'auto'}g, carbs ${ctx.macroTargets.carbs || 'auto'}g, fats ${ctx.macroTargets.fats || 'auto'}g
- Meals per day: ${ctx.mealsPerDay} + ${ctx.snacksPerDay} snacks

Provide a strategy that covers:
1. Overall calorie distribution across meals
2. Macro-nutrient balance approach
3. Cuisine variety plan
4. Key nutrients to focus on based on dietary restrictions
Keep it concise (200 words max).`;

    return this.openai.chatText(prompt, 'You are a professional nutritionist creating meal plans.', 0.5);
  }

  // ──── Step 2: Meal Structure with RAG ────
  private async stepTwoMealStructure(
    strategy: string,
    ctx: any,
    dayCount: number,
    mealsPerDay: number,
  ): Promise<any[]> {
    // Use RAG to find suitable recipes
    const searchTerms = [
      ...ctx.dietaryPreferences,
      ...ctx.cuisinePreferences,
    ].filter(Boolean).join(' ') || 'healthy balanced';

    const ragRecipes = await this.recipeService.searchByVector(searchTerms, 30);

    const recipeSummaries = ragRecipes.map((r: any) =>
      `[${r.id}] "${r.title}" (${r.cuisine}, ${r.meal}, ~${r.time}min) - ${r.summary || ''}`,
    ).join('\n');

    const startDate = new Date();
    const dates: string[] = [];
    for (let d = 0; d < dayCount; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      dates.push(dt.toISOString().split('T')[0]);
    }

    const prompt = `Based on this strategy:
---
${strategy}
---

And these available recipes from our database:
${recipeSummaries}

Create a ${dayCount}-day meal plan with ${mealsPerDay} meals per day.
${ctx.allergies.length ? `MUST AVOID (allergies): ${ctx.allergies.join(', ')}` : ''}
${ctx.dislikedIngredients.length ? `Avoid: ${ctx.dislikedIngredients.join(', ')}` : ''}

Return ONLY a JSON array of meals:
[{
  "date": "YYYY-MM-DD",
  "mealType": "breakfast|lunch|dinner|snack",
  "mealTime": "HH:MM",
  "recipeId": "recipe id from the list above or null",
  "customName": "meal name if no recipe match",
  "servings": 1-2
}]

Assign recipes from the list by their IDs when they fit. For meals without a matching recipe, provide a customName. Ensure variety across days.`;

    const raw = await this.openai.chatText(prompt, 'You are a meal planning assistant. Return only valid JSON.', 0.7);
    const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fallback: generate a basic structure
      return this.generateFallbackStructure(ctx, dayCount, mealsPerDay, ragRecipes);
    }
  }

  // ──── Step 3: Nutritional Analysis & Refinement ────
  private async stepThreeRefine(meals: any[], ctx: any, dayCount: number): Promise<any[]> {
    // Calculate nutrition for each meal using function calling
    for (const meal of meals) {
      if (meal.recipeId) {
        try {
          const recipe = await this.recipeService.getById(meal.recipeId);
          const factor = (meal.servings || 1) / recipe.servings;
          meal.calories = Math.round(recipe.nutrition.calories * factor);
          meal.protein = Math.round(recipe.nutrition.protein * factor * 10) / 10;
          meal.carbs = Math.round(recipe.nutrition.carbs * factor * 10) / 10;
          meal.fats = Math.round(recipe.nutrition.fats * factor * 10) / 10;
        } catch {
          // Recipe not found — use AI estimate
          meal.recipeId = null;
        }
      }

      if (!meal.calories && meal.customName) {
        // Use function calling for nutritional estimate
        try {
          const result = await this.nutritionService.analyzeNutrition(
            [{ name: meal.customName, quantity: 300, unit: 'gram' }],
            meal.servings || 1,
          );
          meal.calories = Math.round(result.nutrition.calories);
          meal.protein = Math.round(result.nutrition.protein * 10) / 10;
          meal.carbs = Math.round(result.nutrition.carbs * 10) / 10;
          meal.fats = Math.round(result.nutrition.fats * 10) / 10;
        } catch {
          // Assign reasonable defaults
          meal.calories = Math.round(ctx.calorieTarget / (ctx.mealsPerDay + ctx.snacksPerDay));
          meal.protein = 25;
          meal.carbs = 40;
          meal.fats = 15;
        }
      }
    }

    // Check daily totals and flag issues
    const dayMap = new Map<string, any[]>();
    for (const meal of meals) {
      const dateKey = meal.date;
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
      dayMap.get(dateKey)!.push(meal);
    }

    const prompt = `Review this ${dayCount}-day meal plan for nutritional balance.
Target: ${ctx.calorieTarget} kcal/day.

${[...dayMap.entries()].map(([date, dMeals]) => {
  const totalCal = dMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0);
  return `${date}: ${totalCal} kcal — ${dMeals.map((m: any) => `${m.mealType}: ${m.customName || m.recipeId} (${m.calories || 0} kcal)`).join(', ')}`;
}).join('\n')}

If any day is significantly off target (>20%), suggest specific adjustments.
Return JSON: [{"date": "...", "mealType": "...", "adjustment": "description", "calorieChange": number}]
Return empty array [] if the plan looks good.`;

    try {
      const raw = await this.openai.chatText(prompt, 'You are a nutritionist. Return only valid JSON.', 0.3);
      const cleaned = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
      const adjustments = JSON.parse(cleaned);
      // Apply minor calorie adjustments if needed
      if (Array.isArray(adjustments)) {
        for (const adj of adjustments) {
          const meal = meals.find((m) => m.date === adj.date && m.mealType === adj.mealType);
          if (meal && adj.calorieChange) {
            meal.calories = Math.max(50, (meal.calories || 0) + adj.calorieChange);
          }
        }
      }
    } catch {
      // Refinement failed — proceed with current plan
    }

    return meals;
  }

  // ────────── Get user's meal plans ──────────

  async getMealPlans(userId: string, opts: { activeOnly?: boolean } = {}): Promise<MealPlanResult[]> {
    const where: any = { userId };
    if (opts.activeOnly) where.isActive = true;

    const plans = await this.prisma.mealPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        meals: { include: { recipe: true }, orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }] },
      },
    });

    return plans.map((p) => this.formatMealPlan(p));
  }

  async getMealPlan(userId: string, planId: string): Promise<MealPlanResult> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, userId },
      include: {
        meals: { include: { recipe: true }, orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!plan) throw new NotFoundException('Meal plan not found');
    return this.formatMealPlan(plan);
  }

  // ────────── Version control ──────────

  async restoreVersion(userId: string, planId: string): Promise<MealPlanResult> {
    const plan = await this.prisma.mealPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException('Meal plan not found');

    // Deactivate current active plans overlapping these dates
    await this.prisma.mealPlan.updateMany({
      where: { userId, isActive: true, startDate: { lte: plan.endDate }, endDate: { gte: plan.startDate } },
      data: { isActive: false },
    });

    // Activate this version
    await this.prisma.mealPlan.update({
      where: { id: planId },
      data: { isActive: true },
    });

    return this.getMealPlan(userId, planId);
  }

  async getVersionHistory(userId: string, startDate: string, endDate: string): Promise<any[]> {
    const plans = await this.prisma.mealPlan.findMany({
      where: {
        userId,
        startDate: { lte: new Date(endDate + 'T23:59:59.999Z') },
        endDate: { gte: new Date(startDate + 'T00:00:00Z') },
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, isActive: true, createdAt: true, duration: true, startDate: true, endDate: true },
    });
    return plans;
  }

  // ────────── Meal operations ──────────

  async swapMeal(userId: string, mealId1: string, mealId2: string): Promise<void> {
    const [m1, m2] = await Promise.all([
      this.prisma.mealPlanMeal.findFirst({
        where: { id: mealId1 },
        include: { mealPlan: { select: { userId: true } } },
      }),
      this.prisma.mealPlanMeal.findFirst({
        where: { id: mealId2 },
        include: { mealPlan: { select: { userId: true } } },
      }),
    ]);

    if (!m1 || !m2) throw new NotFoundException('Meal not found');
    if (m1.mealPlan.userId !== userId || m2.mealPlan.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    // Swap date, mealType, mealTime, sortOrder
    await this.prisma.$transaction([
      this.prisma.mealPlanMeal.update({
        where: { id: mealId1 },
        data: { date: m2.date, mealType: m2.mealType, mealTime: m2.mealTime, sortOrder: m2.sortOrder },
      }),
      this.prisma.mealPlanMeal.update({
        where: { id: mealId2 },
        data: { date: m1.date, mealType: m1.mealType, mealTime: m1.mealTime, sortOrder: m1.sortOrder },
      }),
    ]);
  }

  async updateMeal(userId: string, mealId: string, data: {
    mealType?: string;
    mealTime?: string;
    date?: string;
    sortOrder?: number;
  }): Promise<MealPlanMealResult> {
    const meal = await this.prisma.mealPlanMeal.findFirst({
      where: { id: mealId },
      include: { mealPlan: { select: { userId: true } } },
    });
    if (!meal || meal.mealPlan.userId !== userId) throw new NotFoundException('Meal not found');

    const updateData: any = {};
    if (data.mealType) updateData.mealType = data.mealType;
    if (data.mealTime !== undefined) updateData.mealTime = data.mealTime;
    if (data.date) updateData.date = new Date(data.date + 'T00:00:00Z');
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    const updated = await this.prisma.mealPlanMeal.update({
      where: { id: mealId },
      data: updateData,
      include: { recipe: true },
    });

    return this.formatMeal(updated);
  }

  async addManualMeal(userId: string, planId: string, data: {
    date: string;
    mealType: string;
    mealTime?: string;
    customName: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    servings?: number;
  }): Promise<MealPlanMealResult> {
    const plan = await this.prisma.mealPlan.findFirst({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException('Meal plan not found');

    // Get max sortOrder for this date
    const maxSort = await this.prisma.mealPlanMeal.findFirst({
      where: { mealPlanId: planId, date: new Date(data.date + 'T00:00:00Z') },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const meal = await this.prisma.mealPlanMeal.create({
      data: {
        mealPlanId: planId,
        date: new Date(data.date + 'T00:00:00Z'),
        mealType: data.mealType,
        mealTime: data.mealTime || null,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        customName: data.customName,
        customCalories: data.calories,
        customProtein: data.protein,
        customCarbs: data.carbs,
        customFats: data.fats,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fats: data.fats,
        servings: data.servings || 1,
        isManual: true,
      },
      include: { recipe: true },
    });

    return this.formatMeal(meal);
  }

  async removeMeal(userId: string, mealId: string): Promise<void> {
    const meal = await this.prisma.mealPlanMeal.findFirst({
      where: { id: mealId },
      include: { mealPlan: { select: { userId: true } } },
    });
    if (!meal || meal.mealPlan.userId !== userId) throw new NotFoundException('Meal not found');

    await this.prisma.mealPlanMeal.delete({ where: { id: mealId } });
  }

  async regenerateMeal(userId: string, mealId: string): Promise<MealPlanMealResult> {
    const meal = await this.prisma.mealPlanMeal.findFirst({
      where: { id: mealId },
      include: { mealPlan: { select: { userId: true, preferencesSnapshot: true } } },
    });
    if (!meal || meal.mealPlan.userId !== userId) throw new NotFoundException('Meal not found');

    const prefs = (meal.mealPlan.preferencesSnapshot as any) || {};

    // Use RAG to find an alternative recipe
    const searchTerms = [meal.mealType, ...(prefs.dietaryPreferences || []), ...(prefs.cuisinePreferences || [])].join(' ');
    const alternatives = await this.recipeService.searchByVector(searchTerms, 10);

    // Pick a different recipe than current
    const alt = alternatives.find((r: any) => r.id !== meal.recipeId) || alternatives[0];

    if (alt) {
      try {
        const recipe = await this.recipeService.getById(alt.id);
        const updated = await this.prisma.mealPlanMeal.update({
          where: { id: mealId },
          data: {
            recipeId: alt.id,
            customName: null,
            calories: recipe.nutrition.calories / recipe.servings,
            protein: recipe.nutrition.protein / recipe.servings,
            carbs: recipe.nutrition.carbs / recipe.servings,
            fats: recipe.nutrition.fats / recipe.servings,
          },
          include: { recipe: true },
        });
        return this.formatMeal(updated);
      } catch { /* fall through */ }
    }

    // Fallback: generate a new recipe
    const generated = await this.recipeService.generateRecipe({
      meal: meal.mealType,
      dietaryTags: prefs.dietaryPreferences,
      allergies: prefs.allergies,
      dislikedIngredients: prefs.dislikedIngredients,
      cuisine: prefs.cuisinePreferences?.[Math.floor(Math.random() * (prefs.cuisinePreferences?.length || 1))],
    });

    const updated = await this.prisma.mealPlanMeal.update({
      where: { id: mealId },
      data: {
        recipeId: generated.id,
        customName: null,
        calories: generated.nutrition.calories / generated.servings,
        protein: generated.nutrition.protein / generated.servings,
        carbs: generated.nutrition.carbs / generated.servings,
        fats: generated.nutrition.fats / generated.servings,
      },
      include: { recipe: true },
    });

    return this.formatMeal(updated);
  }

  // ────────── Preferences ──────────

  async getPreferences(userId: string) {
    return this.prisma.mealPlanPreferences.findUnique({ where: { userId } });
  }

  async upsertPreferences(userId: string, data: any) {
    return this.prisma.mealPlanPreferences.upsert({
      where: { userId },
      update: {
        timezone: data.timezone,
        mealsPerDay: data.mealsPerDay,
        snacksPerDay: data.snacksPerDay,
        breakfastTime: data.breakfastTime,
        lunchTime: data.lunchTime,
        dinnerTime: data.dinnerTime,
        snackTime: data.snackTime,
        cuisinePreferences: data.cuisinePreferences || [],
        dislikedIngredients: data.dislikedIngredients || [],
        calorieTarget: data.calorieTarget,
        proteinTarget: data.proteinTarget,
        carbsTarget: data.carbsTarget,
        fatsTarget: data.fatsTarget,
      },
      create: {
        userId,
        timezone: data.timezone || 'UTC',
        mealsPerDay: data.mealsPerDay || 3,
        snacksPerDay: data.snacksPerDay || 0,
        breakfastTime: data.breakfastTime,
        lunchTime: data.lunchTime,
        dinnerTime: data.dinnerTime,
        snackTime: data.snackTime,
        cuisinePreferences: data.cuisinePreferences || [],
        dislikedIngredients: data.dislikedIngredients || [],
        calorieTarget: data.calorieTarget,
        proteinTarget: data.proteinTarget,
        carbsTarget: data.carbsTarget,
        fatsTarget: data.fatsTarget,
      },
    });
  }

  // ────────── Helpers ──────────

  private estimateCalorieTarget(profile: any): number {
    if (!profile) return 2000;
    // Harris-Benedict rough estimate
    const weight = profile.currentWeightKg || 70;
    const height = profile.heightCm || 170;
    const age = profile.age || 30;
    const isMale = profile.gender !== 'female';

    let bmr: number;
    if (isMale) {
      bmr = 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age;
    } else {
      bmr = 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age;
    }

    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    const mult = activityMultipliers[profile.activityLevel || 'moderate'] || 1.55;
    let target = Math.round(bmr * mult);

    // Adjust for goal
    if (profile.primaryGoal === 'lose_weight') target -= 500;
    if (profile.primaryGoal === 'gain_weight') target += 300;

    return Math.max(1200, target);
  }

  private generateFallbackStructure(ctx: any, dayCount: number, mealsPerDay: number, recipes: any[]): any[] {
    const meals: any[] = [];
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack', 'snack'];
    const startDate = new Date();

    for (let d = 0; d < dayCount; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      const dateStr = dt.toISOString().split('T')[0];

      for (let m = 0; m < mealsPerDay; m++) {
        const mealType = mealTypes[m] || 'snack';
        const matching = recipes.filter((r: any) =>
          r.meal?.toLowerCase() === mealType ||
          (mealType === 'snack' && r.meal?.toLowerCase() === 'snack'),
        );
        const recipe = matching.length > 0
          ? matching[Math.floor(Math.random() * matching.length)]
          : recipes[Math.floor(Math.random() * recipes.length)];

        meals.push({
          date: dateStr,
          mealType,
          mealTime: ctx.mealTimes[mealType] || '12:00',
          recipeId: recipe?.id || null,
          customName: recipe ? null : `${mealType} meal`,
          servings: 1,
        });
      }
    }
    return meals;
  }

  private formatMealPlan(plan: any): MealPlanResult {
    return {
      id: plan.id,
      duration: plan.duration,
      startDate: plan.startDate.toISOString(),
      endDate: plan.endDate.toISOString(),
      version: plan.version,
      isActive: plan.isActive,
      meals: (plan.meals || []).map((m: any) => this.formatMeal(m)),
      createdAt: plan.createdAt.toISOString(),
    };
  }

  private formatMeal(m: any): MealPlanMealResult {
    return {
      id: m.id,
      date: m.date.toISOString(),
      mealType: m.mealType,
      mealTime: m.mealTime,
      sortOrder: m.sortOrder,
      recipeId: m.recipeId,
      recipe: m.recipe || undefined,
      customName: m.customName,
      calories: m.calories ?? m.customCalories,
      protein: m.protein ?? m.customProtein,
      carbs: m.carbs ?? m.customCarbs,
      fats: m.fats ?? m.customFats,
      servings: m.servings,
      isManual: m.isManual,
    };
  }
}
