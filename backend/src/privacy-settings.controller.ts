import { 
  Controller, 
  Post, 
  Get, 
  Put, 
  Patch,
  Body, 
  UseGuards, 
  Req, 
  BadRequestException 
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrivacySettingsService } from './privacy-settings.service';
import { Request } from 'express';

type AuthedRequest = Request & { user: { userId: string } };

@Controller('privacy-settings')
@UseGuards(JwtAuthGuard)
export class PrivacySettingsController {
  constructor(private privacySettingsService: PrivacySettingsService) {}

  @Get()
  async getSettings(@Req() req: AuthedRequest) {
    const userId = req.user.userId;
    return await this.privacySettingsService.getSettings(userId);
  }

  @Post()
  async createOrUpdateSettings(@Req() req: AuthedRequest, @Body() body: any) {
    const userId = req.user.userId;
    
    try {
      return await this.privacySettingsService.createOrUpdateSettings(userId, body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Put()
  async updateSettings(@Req() req: AuthedRequest, @Body() body: any) {
    const userId = req.user.userId;
    
    try {
      return await this.privacySettingsService.updateSettings(userId, body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Patch()
  async patchSettings(@Req() req: AuthedRequest, @Body() body: any) {
    const userId = req.user.userId;
    
    try {
      return await this.privacySettingsService.updateSettings(userId, body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
