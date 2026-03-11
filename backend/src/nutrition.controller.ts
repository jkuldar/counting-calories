import {
  Controller, Get, Post, Delete, Patch,
  Body, Param, Query, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { NutritionService } from './nutrition.service';

@Controller('nutrition')
@UseGuards(JwtAuthGuard)
export class NutritionController {
  constructor(private nutritionService: NutritionService) {}

  @Post('analyze')
  async analyze(@Body() body: { ingredients: any[]; servings: number; userContext?: string }) {
    if (!body.ingredients?.length || !body.servings) {
      throw new BadRequestException('ingredients and servings required');
    }
    return this.nutritionService.analyzeNutrition(body.ingredients, body.servings, body.userContext);
  }

  @Get('daily/:date')
  async dailyAnalysis(
    @Req() req: any,
    @Param('date') date: string,
    @Query('calorieTarget') calorieTarget?: string,
    @Query('proteinTarget') proteinTarget?: string,
    @Query('carbsTarget') carbsTarget?: string,
    @Query('fatsTarget') fatsTarget?: string,
  ) {
    const targets = (calorieTarget || proteinTarget || carbsTarget || fatsTarget) ? {
      calories: calorieTarget ? Number(calorieTarget) : 0,
      protein: proteinTarget ? Number(proteinTarget) : 0,
      carbs: carbsTarget ? Number(carbsTarget) : 0,
      fats: fatsTarget ? Number(fatsTarget) : 0,
    } : undefined;

    return this.nutritionService.analyzeDailyIntake(req.user.userId, date, targets);
  }

  @Get('weekly/:startDate')
  async weeklyAnalysis(@Req() req: any, @Param('startDate') startDate: string) {
    return this.nutritionService.analyzeWeeklyIntake(req.user.userId, startDate);
  }

  @Post('log')
  async logMeal(@Req() req: any, @Body() body: any) {
    if (!body.date || body.calories === undefined) {
      throw new BadRequestException('date and calories required');
    }
    return this.nutritionService.logMeal(req.user.userId, body);
  }

  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) throw new BadRequestException('startDate and endDate required');
    return this.nutritionService.getLogs(req.user.userId, startDate, endDate);
  }
}
