import { Controller, Get, Post, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AIService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  /**
   * Get AI insight for the current user
   * Returns cached insight if available, otherwise generates new one
   */
  @Get('insight')
  async getInsight(@Req() req: any) {
    const userId = req.user.userId;
    const result = await this.aiService.getInsight(userId);

    if (!result.insight) {
      return {
        success: false,
        reason: result.reason,
        message: result.message,
      };
    }

    return {
      success: true,
      reason: result.reason,
      insight: {
        id: result.insight.id,
        response: result.insight.response,
        priority: result.insight.priority,
        fromCache: result.insight.fromCache,
        createdAt: result.insight.createdAt,
        validation: {
          isValid: result.insight.isValid,
          violatesRestrictions: result.insight.violatesRestrictions,
          notes: result.insight.validationNotes,
        },
      },
    };
  }

  /**
   * Get insight history for the current user
   */
  @Get('insights')
  async getInsights(
    @Req() req: any,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.userId;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    const insights = await this.aiService.getUserInsights(userId, limitNum);

    return {
      success: true,
      insights,
    };
  }

  /**
   * Invalidate cache and force regeneration
   */
  @Post('invalidate-cache')
  async invalidateCache(@Req() req: any) {
    const userId = req.user.userId;
    await this.aiService.invalidateCache(userId);

    return {
      success: true,
      message: 'Cache invalidated. Next insight request will generate a fresh recommendation.',
    };
  }
}
