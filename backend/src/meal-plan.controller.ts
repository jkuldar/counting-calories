import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MealPlanningService } from './meal-planning.service';

@Controller('meal-plans')
@UseGuards(JwtAuthGuard)
export class MealPlanController {
  constructor(private mealPlanService: MealPlanningService) {}

  @Post()
  async generate(@Req() req: any, @Body() body: any) {
    const userId = req.user.userId;
    if (!body.duration || !body.startDate) {
      throw new BadRequestException('duration and startDate required');
    }
    if (!['daily', 'weekly'].includes(body.duration)) {
      throw new BadRequestException('duration must be daily or weekly');
    }
    return this.mealPlanService.generateMealPlan(userId, body);
  }

  @Get()
  async list(@Req() req: any, @Query('activeOnly') activeOnly?: string) {
    return this.mealPlanService.getMealPlans(req.user.userId, {
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    return this.mealPlanService.getPreferences(req.user.userId);
  }

  @Put('preferences')
  async updatePreferences(@Req() req: any, @Body() body: any) {
    return this.mealPlanService.upsertPreferences(req.user.userId, body);
  }

  @Get('versions')
  async getVersions(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) throw new BadRequestException('startDate and endDate required');
    return this.mealPlanService.getVersionHistory(req.user.userId, startDate, endDate);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.mealPlanService.getMealPlan(req.user.userId, id);
  }

  @Post(':id/restore')
  async restore(@Req() req: any, @Param('id') id: string) {
    return this.mealPlanService.restoreVersion(req.user.userId, id);
  }

  @Post(':id/meals')
  async addMeal(@Req() req: any, @Param('id') planId: string, @Body() body: any) {
    if (!body.date || !body.mealType || !body.customName) {
      throw new BadRequestException('date, mealType, and customName required');
    }
    return this.mealPlanService.addManualMeal(req.user.userId, planId, body);
  }

  @Post('meals/swap')
  async swapMeals(@Req() req: any, @Body() body: { mealId1: string; mealId2: string }) {
    if (!body.mealId1 || !body.mealId2) throw new BadRequestException('mealId1 and mealId2 required');
    await this.mealPlanService.swapMeal(req.user.userId, body.mealId1, body.mealId2);
    return { success: true };
  }

  @Patch('meals/:mealId')
  async updateMeal(@Req() req: any, @Param('mealId') mealId: string, @Body() body: any) {
    return this.mealPlanService.updateMeal(req.user.userId, mealId, body);
  }

  @Post('meals/:mealId/regenerate')
  async regenerateMeal(@Req() req: any, @Param('mealId') mealId: string) {
    return this.mealPlanService.regenerateMeal(req.user.userId, mealId);
  }

  @Delete('meals/:mealId')
  async removeMeal(@Req() req: any, @Param('mealId') mealId: string) {
    await this.mealPlanService.removeMeal(req.user.userId, mealId);
    return { success: true };
  }
}
