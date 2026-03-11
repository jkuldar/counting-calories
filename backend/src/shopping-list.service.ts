import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// ---------------------------------------------------------------------------
// Category mapping — at least 5+ meaningful categories
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dairy: ['milk', 'cheese', 'yogurt', 'cream', 'butter', 'curd', 'whey', 'ghee', 'paneer', 'ricotta', 'mozzarella', 'parmesan', 'cheddar', 'feta', 'cottage cheese', 'sour cream', 'kefir'],
  produce: ['lettuce', 'tomato', 'onion', 'garlic', 'pepper', 'carrot', 'spinach', 'broccoli', 'zucchini', 'cucumber', 'potato', 'sweet potato', 'celery', 'mushroom', 'eggplant', 'avocado', 'cabbage', 'kale', 'beet', 'corn', 'pea', 'bean sprout', 'radish', 'leek', 'asparagus', 'cauliflower', 'artichoke', 'squash', 'pumpkin', 'turnip', 'apple', 'banana', 'orange', 'lemon', 'lime', 'berry', 'grape', 'mango', 'pineapple', 'peach', 'pear', 'watermelon', 'cherry', 'plum', 'fig', 'date', 'coconut', 'ginger', 'jalap'],
  grains: ['rice', 'pasta', 'bread', 'flour', 'oat', 'quinoa', 'barley', 'couscous', 'noodle', 'tortilla', 'cereal', 'granola', 'wheat', 'rye', 'corn meal', 'polenta', 'bulgur', 'millet', 'farro', 'sorghum', 'amaranth', 'buckwheat'],
  protein: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'lobster', 'tofu', 'tempeh', 'seitan', 'egg', 'lentil', 'chickpea', 'black bean', 'kidney bean', 'navy bean', 'edamame', 'sausage', 'bacon', 'ham', 'steak', 'ground beef', 'sardine', 'cod', 'tilapia', 'scallop', 'mussel', 'clam', 'duck', 'venison', 'bison', 'anchov'],
  'nuts & seeds': ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'peanut', 'hazelnut', 'macadamia', 'pine nut', 'sunflower seed', 'pumpkin seed', 'sesame', 'chia', 'flax', 'hemp seed', 'poppy seed', 'tahini'],
  condiments: ['ketchup', 'mustard', 'mayonnaise', 'soy sauce', 'vinegar', 'hot sauce', 'sriracha', 'salsa', 'relish', 'worcestershire', 'fish sauce', 'oyster sauce', 'teriyaki', 'bbq sauce', 'hoisin', 'chutney', 'pesto', 'hummus', 'miso', 'tamari'],
  'oils & fats': ['olive oil', 'vegetable oil', 'coconut oil', 'sesame oil', 'canola oil', 'sunflower oil', 'avocado oil', 'lard', 'shortening', 'margarine', 'cooking spray'],
  spices: ['salt', 'pepper', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'nutmeg', 'oregano', 'basil', 'thyme', 'rosemary', 'parsley', 'cilantro', 'dill', 'bay leaf', 'chili powder', 'curry powder', 'garam masala', 'coriander', 'fennel', 'cardamom', 'clove', 'saffron', 'vanilla', 'mint', 'sage', 'tarragon', 'marjoram'],
  beverages: ['coffee', 'tea', 'juice', 'wine', 'beer', 'broth', 'stock', 'coconut milk', 'almond milk', 'soy milk', 'oat milk', 'water'],
  baking: ['sugar', 'brown sugar', 'honey', 'maple syrup', 'molasses', 'agave', 'baking powder', 'baking soda', 'yeast', 'cornstarch', 'gelatin', 'cocoa', 'chocolate', 'extract', 'food color'],
};

function categorizeIngredient(label: string): string {
  const lower = label.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return 'other';
}

@Injectable()
export class ShoppingListService {
  private readonly logger = new Logger(ShoppingListService.name);

  constructor(private prisma: PrismaService) {}

  // ────────── Generate from meal plan ──────────

  async generateFromMealPlan(userId: string, mealPlanId: string, name?: string) {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: mealPlanId, userId },
      include: {
        meals: {
          include: {
            recipe: {
              include: {
                ingredients: { include: { ingredient: true } },
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Meal plan not found');

    // Aggregate ingredients across all meals
    const aggregated = new Map<string, { ingredientId: string; name: string; quantity: number; unit: string; category: string }>();

    for (const meal of plan.meals) {
      if (!meal.recipe) continue;
      const servingFactor = (meal.servings || 1) / meal.recipe.servings;

      for (const ri of meal.recipe.ingredients) {
        const key = ri.ingredientId;
        const quantity = ri.quantity * servingFactor;
        if (aggregated.has(key)) {
          aggregated.get(key)!.quantity += quantity;
        } else {
          aggregated.set(key, {
            ingredientId: ri.ingredientId,
            name: ri.ingredient.label,
            quantity,
            unit: ri.ingredient.unit === 'ml' ? 'ml' : 'g',
            category: categorizeIngredient(ri.ingredient.label),
          });
        }
      }
    }

    // Create shopping list
    const list = await this.prisma.shoppingList.create({
      data: {
        userId,
        mealPlanId,
        name: name || `Shopping list for ${plan.duration} plan`,
        items: {
          create: [...aggregated.values()].map((item) => ({
            ingredientId: item.ingredientId,
            name: item.name,
            quantity: Math.round(item.quantity * 10) / 10,
            unit: item.unit,
            category: item.category,
          })),
        },
      },
      include: { items: true },
    });

    return list;
  }

  // ────────── Generate from specific meals ──────────

  async generateFromMeals(userId: string, mealIds: string[], name?: string) {
    const meals = await this.prisma.mealPlanMeal.findMany({
      where: { id: { in: mealIds } },
      include: {
        mealPlan: { select: { userId: true } },
        recipe: { include: { ingredients: { include: { ingredient: true } } } },
      },
    });

    // Verify ownership
    for (const m of meals) {
      if (m.mealPlan.userId !== userId) throw new NotFoundException('Meal not found');
    }

    const aggregated = new Map<string, { ingredientId: string; name: string; quantity: number; unit: string; category: string }>();

    for (const meal of meals) {
      if (!meal.recipe) continue;
      const servingFactor = (meal.servings || 1) / meal.recipe.servings;
      for (const ri of meal.recipe.ingredients) {
        const key = ri.ingredientId;
        const quantity = ri.quantity * servingFactor;
        if (aggregated.has(key)) {
          aggregated.get(key)!.quantity += quantity;
        } else {
          aggregated.set(key, {
            ingredientId: ri.ingredientId,
            name: ri.ingredient.label,
            quantity,
            unit: ri.ingredient.unit === 'ml' ? 'ml' : 'g',
            category: categorizeIngredient(ri.ingredient.label),
          });
        }
      }
    }

    const list = await this.prisma.shoppingList.create({
      data: {
        userId,
        name: name || 'Shopping list',
        items: {
          create: [...aggregated.values()].map((item) => ({
            ingredientId: item.ingredientId,
            name: item.name,
            quantity: Math.round(item.quantity * 10) / 10,
            unit: item.unit,
            category: item.category,
          })),
        },
      },
      include: { items: true },
    });

    return list;
  }

  // ────────── CRUD ──────────

  async getAll(userId: string) {
    return this.prisma.shoppingList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: { where: { isRemoved: false } } },
    });
  }

  async getById(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({
      where: { id: listId, userId },
      include: { items: true },
    });
    if (!list) throw new NotFoundException('Shopping list not found');
    return list;
  }

  async deleteList(userId: string, listId: string) {
    const list = await this.prisma.shoppingList.findFirst({ where: { id: listId, userId } });
    if (!list) throw new NotFoundException('Shopping list not found');
    await this.prisma.shoppingList.delete({ where: { id: listId } });
  }

  // ────────── Item operations ──────────

  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const item = await this.findItemForUser(userId, itemId);
    return this.prisma.shoppingListItem.update({
      where: { id: item.id },
      data: { quantity: Math.max(0, quantity) },
    });
  }

  async toggleItemChecked(userId: string, itemId: string) {
    const item = await this.findItemForUser(userId, itemId);
    return this.prisma.shoppingListItem.update({
      where: { id: item.id },
      data: { isChecked: !item.isChecked },
    });
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.findItemForUser(userId, itemId);
    return this.prisma.shoppingListItem.update({
      where: { id: item.id },
      data: { isRemoved: true },
    });
  }

  private async findItemForUser(userId: string, itemId: string) {
    const item = await this.prisma.shoppingListItem.findFirst({
      where: { id: itemId },
      include: { shoppingList: { select: { userId: true } } },
    });
    if (!item || item.shoppingList.userId !== userId) throw new NotFoundException('Item not found');
    return item;
  }
}
