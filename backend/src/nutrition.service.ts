import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OpenAIHelper } from './openai-helper.service';

// ---------------------------------------------------------------------------
// Function definitions exposed to OpenAI
// ---------------------------------------------------------------------------

const NUTRITION_FUNCTIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'calculate_nutrition',
      description: 'Calculates total nutritional information for a list of ingredients with quantities. Returns calories (kcal), protein (g), carbs (g), fats (g).',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'array',
            description: 'List of ingredients with quantities',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Ingredient name' },
                quantity: { type: 'number', description: 'Amount in grams or ml' },
                unit: { type: 'string', enum: ['gram', 'ml'], description: 'Unit of measurement' },
              },
              required: ['name', 'quantity', 'unit'],
            },
          },
          servings: { type: 'number', description: 'Number of servings the total quantity makes' },
        },
        required: ['ingredients', 'servings'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculate_daily_totals',
      description: 'Calculates total daily nutritional intake from multiple meals. Returns combined calories, protein, carbs, fats and comparison to targets.',
      parameters: {
        type: 'object',
        properties: {
          meals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                mealType: { type: 'string' },
                calories: { type: 'number' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fats: { type: 'number' },
              },
              required: ['mealType', 'calories', 'protein', 'carbs', 'fats'],
            },
          },
          targets: {
            type: 'object',
            properties: {
              calories: { type: 'number' },
              protein: { type: 'number' },
              carbs: { type: 'number' },
              fats: { type: 'number' },
            },
          },
        },
        required: ['meals'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'adjust_recipe_portions',
      description: 'Recalculates ingredient quantities and nutrition when serving size changes.',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
              },
              required: ['name', 'quantity', 'unit'],
            },
          },
          originalServings: { type: 'number' },
          newServings: { type: 'number' },
        },
        required: ['ingredients', 'originalServings', 'newServings'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface DailyTotals extends NutritionInfo {
  meals: { mealType: string; calories: number; protein: number; carbs: number; fats: number }[];
  targets?: NutritionInfo;
  deficit?: NutritionInfo;
}

export interface DailyLog {
  date: string;
  totals: NutritionInfo;
  meals: { mealType: string; calories: number; protein: number; carbs: number; fats: number; recipeId?: string }[];
}

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);

  constructor(
    private prisma: PrismaService,
    private openai: OpenAIHelper,
  ) {}

  // ────────── Function execution (called when AI requests a function) ──────────

  async executeFunction(name: string, args: any): Promise<any> {
    switch (name) {
      case 'calculate_nutrition':
        return this.fnCalculateNutrition(args.ingredients, args.servings);
      case 'calculate_daily_totals':
        return this.fnCalculateDailyTotals(args.meals, args.targets);
      case 'adjust_recipe_portions':
        return this.fnAdjustPortions(args.ingredients, args.originalServings, args.newServings);
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  // ────────── Core function implementations ──────────

  /** calculate_nutrition: look up ingredients in DB and sum nutritional values */
  async fnCalculateNutrition(
    ingredients: { name: string; quantity: number; unit: string }[],
    servings: number,
  ): Promise<NutritionInfo & { perServing: NutritionInfo; details: any[] }> {
    const details: any[] = [];
    let totalCal = 0, totalProt = 0, totalCarbs = 0, totalFats = 0;

    for (const ing of ingredients) {
      const dbIng = await this.prisma.ingredient.findFirst({
        where: { label: { equals: ing.name.toLowerCase(), mode: 'insensitive' } },
      });

      let cal: number, prot: number, carb: number, fat: number;
      if (dbIng && dbIng.quantity > 0) {
        const factor = ing.quantity / dbIng.quantity;
        cal = dbIng.calories * factor;
        prot = dbIng.protein * factor;
        carb = dbIng.carbs * factor;
        fat = dbIng.fats * factor;
      } else {
        // Fallback: estimate ~1 kcal/g average (very rough)
        cal = ing.quantity * 1;
        prot = 0;
        carb = 0;
        fat = 0;
      }

      details.push({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        calories: Math.round(cal * 10) / 10,
        protein: Math.round(prot * 10) / 10,
        carbs: Math.round(carb * 10) / 10,
        fats: Math.round(fat * 10) / 10,
        fromDatabase: !!dbIng,
      });

      totalCal += cal;
      totalProt += prot;
      totalCarbs += carb;
      totalFats += fat;
    }

    const perServing = {
      calories: Math.round((totalCal / servings) * 10) / 10,
      protein: Math.round((totalProt / servings) * 10) / 10,
      carbs: Math.round((totalCarbs / servings) * 10) / 10,
      fats: Math.round((totalFats / servings) * 10) / 10,
    };

    return {
      calories: Math.round(totalCal * 10) / 10,
      protein: Math.round(totalProt * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fats: Math.round(totalFats * 10) / 10,
      perServing,
      details,
    };
  }

  /** calculate_daily_totals: sum meals and compare to targets */
  fnCalculateDailyTotals(
    meals: { mealType: string; calories: number; protein: number; carbs: number; fats: number }[],
    targets?: { calories?: number; protein?: number; carbs?: number; fats?: number },
  ): DailyTotals {
    const totals: NutritionInfo = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    for (const m of meals) {
      totals.calories += m.calories;
      totals.protein += m.protein;
      totals.carbs += m.carbs;
      totals.fats += m.fats;
    }

    const result: DailyTotals = { ...totals, meals };

    if (targets) {
      result.targets = {
        calories: targets.calories ?? 0,
        protein: targets.protein ?? 0,
        carbs: targets.carbs ?? 0,
        fats: targets.fats ?? 0,
      };
      result.deficit = {
        calories: (targets.calories ?? 0) - totals.calories,
        protein: (targets.protein ?? 0) - totals.protein,
        carbs: (targets.carbs ?? 0) - totals.carbs,
        fats: (targets.fats ?? 0) - totals.fats,
      };
    }

    return result;
  }

  /** adjust_recipe_portions */
  fnAdjustPortions(
    ingredients: { name: string; quantity: number; unit: string }[],
    originalServings: number,
    newServings: number,
  ) {
    const factor = newServings / originalServings;
    return {
      originalServings,
      newServings,
      factor,
      ingredients: ingredients.map((i) => ({
        ...i,
        quantity: Math.round(i.quantity * factor * 10) / 10,
      })),
    };
  }

  // ────────── AI-driven nutritional analysis with function calling ──────────

  async analyzeNutrition(
    ingredients: { name: string; quantity: number; unit: string }[],
    servings: number,
    userContext?: string,
  ): Promise<{ nutrition: NutritionInfo; analysis: string }> {
    const messages: { role: string; content: string }[] = [
      {
        role: 'system',
        content: 'You are a nutritionist. Analyze meals and provide nutritional information. Use the calculate_nutrition function to get accurate nutritional data. After receiving the data, provide a brief analysis.',
      },
      {
        role: 'user',
        content: `Calculate the nutritional information for this recipe (${servings} servings):\n${ingredients.map((i) => `- ${i.name}: ${i.quantity}${i.unit}`).join('\n')}${userContext ? `\n\nUser context: ${userContext}` : ''}`,
      },
    ];

    // First call — AI should request function calling
    let data = await this.openai.chat(messages, { tools: NUTRITION_FUNCTIONS, temperature: 0.3 });
    let msg = data.choices[0].message;

    // Process function calls (may require multiple rounds)
    let nutrition: NutritionInfo | null = null;
    const maxRounds = 5;
    for (let round = 0; round < maxRounds && msg.tool_calls?.length; round++) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        let fnArgs: any;
        try {
          fnArgs = JSON.parse(tc.function.arguments);
        } catch {
          messages.push({ role: 'tool' as any, content: JSON.stringify({ error: 'Invalid JSON arguments' }) } as any);
          continue;
        }

        try {
          const result = await this.executeFunction(tc.function.name, fnArgs);
          if (tc.function.name === 'calculate_nutrition') {
            nutrition = { calories: result.calories, protein: result.protein, carbs: result.carbs, fats: result.fats };
          }
          const toolMsg: any = { role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id };
          messages.push(toolMsg);
        } catch (err: any) {
          const toolMsg: any = { role: 'tool', content: JSON.stringify({ error: err.message }), tool_call_id: tc.id };
          messages.push(toolMsg);
        }
      }

      data = await this.openai.chat(messages, { tools: NUTRITION_FUNCTIONS, temperature: 0.3 });
      msg = data.choices[0].message;
    }

    // If AI didn't call the function, compute directly
    if (!nutrition) {
      const computed = await this.fnCalculateNutrition(ingredients, servings);
      nutrition = { calories: computed.calories, protein: computed.protein, carbs: computed.carbs, fats: computed.fats };
    }

    return {
      nutrition,
      analysis: msg.content || 'Nutritional calculation complete.',
    };
  }

  // ────────── AI analysis for daily/weekly tracking ──────────

  async analyzeDailyIntake(
    userId: string,
    date: string,
    targets?: NutritionInfo,
  ): Promise<{ totals: DailyTotals; analysis: string }> {
    const startOfDay = new Date(date + 'T00:00:00Z');
    const endOfDay = new Date(date + 'T23:59:59.999Z');

    const logs = await this.prisma.nutritionalLog.findMany({
      where: { userId, date: { gte: startOfDay, lte: endOfDay } },
      orderBy: { date: 'asc' },
    });

    const meals = logs.map((l) => ({
      mealType: l.mealType || 'other',
      calories: l.calories,
      protein: l.protein,
      carbs: l.carbs,
      fats: l.fats,
    }));

    // Use function calling flow for analysis
    const messages: { role: string; content: string }[] = [
      {
        role: 'system',
        content: 'You are a nutritionist. Use the calculate_daily_totals function to compute the daily intake, then provide brief personalized feedback.',
      },
      {
        role: 'user',
        content: `Calculate daily nutritional totals for ${date}:\nMeals: ${JSON.stringify(meals)}\n${targets ? `Targets: ${JSON.stringify(targets)}` : ''}`,
      },
    ];

    let data = await this.openai.chat(messages, { tools: NUTRITION_FUNCTIONS, temperature: 0.4 });
    let msg = data.choices[0].message;

    let totals: DailyTotals | null = null;
    const maxRounds = 5;
    for (let round = 0; round < maxRounds && msg.tool_calls?.length; round++) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        let fnArgs: any;
        try {
          fnArgs = JSON.parse(tc.function.arguments);
        } catch {
          const toolMsg: any = { role: 'tool', content: JSON.stringify({ error: 'Invalid arguments' }), tool_call_id: tc.id };
          messages.push(toolMsg);
          continue;
        }

        try {
          const result = await this.executeFunction(tc.function.name, fnArgs);
          if (tc.function.name === 'calculate_daily_totals') totals = result;
          const toolMsg: any = { role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id };
          messages.push(toolMsg);
        } catch (err: any) {
          const toolMsg: any = { role: 'tool', content: JSON.stringify({ error: err.message }), tool_call_id: tc.id };
          messages.push(toolMsg);
        }
      }

      data = await this.openai.chat(messages, { tools: NUTRITION_FUNCTIONS, temperature: 0.4 });
      msg = data.choices[0].message;
    }

    if (!totals) {
      totals = this.fnCalculateDailyTotals(meals, targets);
    }

    return {
      totals,
      analysis: msg.content || 'Daily totals calculated.',
    };
  }

  // ────────── Weekly analysis ──────────

  async analyzeWeeklyIntake(userId: string, startDate: string): Promise<{ days: DailyLog[]; weeklyAvg: NutritionInfo; analysis: string }> {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const logs = await this.prisma.nutritionalLog.findMany({
      where: { userId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });

    // Group by day
    const dayMap = new Map<string, DailyLog>();
    for (const log of logs) {
      const dateStr = log.date.toISOString().split('T')[0];
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { date: dateStr, totals: { calories: 0, protein: 0, carbs: 0, fats: 0 }, meals: [] });
      }
      const day = dayMap.get(dateStr)!;
      day.meals.push({
        mealType: log.mealType || 'other',
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fats: log.fats,
        recipeId: log.recipeId ?? undefined,
      });
      day.totals.calories += log.calories;
      day.totals.protein += log.protein;
      day.totals.carbs += log.carbs;
      day.totals.fats += log.fats;
    }

    const days = [...dayMap.values()];
    const dayCount = days.length || 1;
    const weeklyAvg: NutritionInfo = {
      calories: days.reduce((s, d) => s + d.totals.calories, 0) / dayCount,
      protein: days.reduce((s, d) => s + d.totals.protein, 0) / dayCount,
      carbs: days.reduce((s, d) => s + d.totals.carbs, 0) / dayCount,
      fats: days.reduce((s, d) => s + d.totals.fats, 0) / dayCount,
    };

    // Brief AI analysis
    let analysis = '';
    try {
      analysis = await this.openai.chatText(
        `Weekly nutrition summary: ${JSON.stringify({ weeklyAvg, daysLogged: days.length })}. Provide 2-3 bullet points of feedback.`,
        'You are a nutritionist. Be concise.',
        0.5,
      );
    } catch {
      analysis = 'Weekly analysis unavailable.';
    }

    return { days, weeklyAvg, analysis };
  }

  // ────────── Log a meal ──────────

  async logMeal(userId: string, data: {
    date: string;
    mealType?: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    recipeId?: string;
    mealPlanId?: string;
    isManual?: boolean;
  }) {
    return this.prisma.nutritionalLog.create({
      data: {
        userId,
        date: new Date(data.date),
        mealType: data.mealType,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fats: data.fats,
        recipeId: data.recipeId,
        mealPlanId: data.mealPlanId,
        isManual: data.isManual ?? false,
      },
    });
  }

  /** Get user's daily logs for a date range */
  async getLogs(userId: string, startDate: string, endDate: string) {
    return this.prisma.nutritionalLog.findMany({
      where: {
        userId,
        date: {
          gte: new Date(startDate + 'T00:00:00Z'),
          lte: new Date(endDate + 'T23:59:59.999Z'),
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  /** Expose the function tool definitions for other services */
  getToolDefinitions() {
    return NUTRITION_FUNCTIONS;
  }
}
