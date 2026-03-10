import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OpenAIHelper } from './openai-helper.service';
import { RecipeService } from './recipe.service';
import { RecipeController } from './recipe.controller';
import { NutritionService } from './nutrition.service';
import { NutritionController } from './nutrition.controller';
import { MealPlanningService } from './meal-planning.service';
import { MealPlanController } from './meal-plan.controller';
import { ShoppingListService } from './shopping-list.service';
import { ShoppingListController } from './shopping-list.controller';

@Module({
  controllers: [
    RecipeController,
    NutritionController,
    MealPlanController,
    ShoppingListController,
  ],
  providers: [
    PrismaService,
    OpenAIHelper,
    RecipeService,
    NutritionService,
    MealPlanningService,
    ShoppingListService,
  ],
  exports: [
    RecipeService,
    NutritionService,
    MealPlanningService,
    ShoppingListService,
    OpenAIHelper,
  ],
})
export class MealPlanModule {}
