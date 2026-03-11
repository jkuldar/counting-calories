import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RecipeService, RecipeSearchParams } from './recipe.service';

@Controller('recipes')
@UseGuards(JwtAuthGuard)
export class RecipeController {
  constructor(private recipeService: RecipeService) {}

  @Get()
  async search(
    @Query('q') query?: string,
    @Query('cuisine') cuisine?: string,
    @Query('meal') meal?: string,
    @Query('dietaryTags') dietaryTags?: string,
    @Query('allergies') allergies?: string,
    @Query('excludeIngredients') excludeIngredients?: string,
    @Query('maxCalories') maxCalories?: string,
    @Query('minProtein') minProtein?: string,
    @Query('maxTime') maxTime?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const params: RecipeSearchParams = {
      query,
      cuisine,
      meal,
      dietaryTags: dietaryTags ? dietaryTags.split(',').map((s) => s.trim()) : undefined,
      allergies: allergies ? allergies.split(',').map((s) => s.trim()) : undefined,
      excludeIngredients: excludeIngredients ? excludeIngredients.split(',').map((s) => s.trim()) : undefined,
      maxCalories: maxCalories ? Number(maxCalories) : undefined,
      minProtein: minProtein ? Number(minProtein) : undefined,
      maxTime: maxTime ? Number(maxTime) : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    };
    return this.recipeService.search(params);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.recipeService.getById(id);
  }

  @Post('generate')
  async generate(@Body() body: any) {
    return this.recipeService.generateRecipe(body);
  }

  @Post(':id/substitute')
  async substitute(
    @Param('id') recipeId: string,
    @Body() body: { ingredientId: string; reason?: string },
  ) {
    if (!body.ingredientId) throw new BadRequestException('ingredientId required');
    return this.recipeService.substituteIngredient(recipeId, body.ingredientId, body.reason);
  }

  @Get(':id/portions/:servings')
  async adjustPortions(
    @Param('id') recipeId: string,
    @Param('servings') servings: string,
  ) {
    const n = Number(servings);
    if (!n || n < 1 || n > 100) throw new BadRequestException('Invalid servings');
    return this.recipeService.adjustPortions(recipeId, n);
  }
}
