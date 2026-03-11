import {
  Controller, Get, Post, Delete, Patch,
  Body, Param, Query, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ShoppingListService } from './shopping-list.service';

@Controller('shopping-lists')
@UseGuards(JwtAuthGuard)
export class ShoppingListController {
  constructor(private shoppingListService: ShoppingListService) {}

  @Get()
  async getAll(@Req() req: any) {
    return this.shoppingListService.getAll(req.user.userId);
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    return this.shoppingListService.getById(req.user.userId, id);
  }

  @Post('from-meal-plan')
  async fromMealPlan(@Req() req: any, @Body() body: { mealPlanId: string; name?: string }) {
    if (!body.mealPlanId) throw new BadRequestException('mealPlanId required');
    return this.shoppingListService.generateFromMealPlan(req.user.userId, body.mealPlanId, body.name);
  }

  @Post('from-meals')
  async fromMeals(@Req() req: any, @Body() body: { mealIds: string[]; name?: string }) {
    if (!body.mealIds?.length) throw new BadRequestException('mealIds required');
    return this.shoppingListService.generateFromMeals(req.user.userId, body.mealIds, body.name);
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    await this.shoppingListService.deleteList(req.user.userId, id);
    return { success: true };
  }

  @Patch('items/:itemId/quantity')
  async updateQuantity(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number },
  ) {
    if (body.quantity === undefined) throw new BadRequestException('quantity required');
    return this.shoppingListService.updateItemQuantity(req.user.userId, itemId, body.quantity);
  }

  @Patch('items/:itemId/toggle')
  async toggleChecked(@Req() req: any, @Param('itemId') itemId: string) {
    return this.shoppingListService.toggleItemChecked(req.user.userId, itemId);
  }

  @Delete('items/:itemId')
  async removeItem(@Req() req: any, @Param('itemId') itemId: string) {
    return this.shoppingListService.removeItem(req.user.userId, itemId);
  }
}
