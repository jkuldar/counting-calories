import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrivacySettingsService {
  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Get privacy settings for a user
   */
  async getSettings(userId: string) {
    let settings = await this.prisma.privacySettings.findUnique({
      where: { userId },
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await this.prisma.privacySettings.create({
        data: {
          userId,
          shareWithAI: true,
          shareAnonymousData: false,
          allowDataExport: true,
          includeWeight: true,
          includeActivity: true,
          includeDietary: true,
          includeGoals: true,
          includeMedical: false,
        },
      });
    }

    return settings;
  }

  /**
   * Create or update privacy settings
   */
  async createOrUpdateSettings(userId: string, data: any) {
    const settingsData = {
      shareWithAI: data.shareWithAI ?? true,
      shareAnonymousData: data.shareAnonymousData ?? false,
      allowDataExport: data.allowDataExport ?? true,
      includeWeight: data.includeWeight ?? true,
      includeActivity: data.includeActivity ?? true,
      includeDietary: data.includeDietary ?? true,
      includeGoals: data.includeGoals ?? true,
      includeMedical: data.includeMedical ?? false,
    };

    const settings = await this.prisma.privacySettings.upsert({
      where: { userId },
      update: settingsData,
      create: {
        userId,
        ...settingsData,
      },
    });

    return {
      message: 'Privacy settings updated successfully',
      settings,
    };
  }

  /**
   * Update specific privacy settings
   */
  async updateSettings(userId: string, data: any) {
    const allowedFields: Record<string, boolean | undefined> = {};
    const fieldNames = [
      'shareWithAI', 'shareAnonymousData', 'allowDataExport',
      'includeWeight', 'includeActivity', 'includeDietary', 'includeGoals', 'includeMedical',
    ];
    for (const field of fieldNames) {
      if (field in data) allowedFields[field] = data[field];
    }

    const settings = await this.prisma.privacySettings.update({
      where: { userId },
      data: allowedFields,
    });

    return {
      message: 'Privacy settings updated successfully',
      settings,
    };
  }

  /**
   * Get filtered data for AI based on privacy settings
   */
  async getAIReadyData(userId: string) {
    const settings = await this.getSettings(userId);
    
    if (!settings.shareWithAI) {
      return null;
    }

    const healthProfile = await this.prisma.healthProfile.findUnique({
      where: { userId },
    });

    if (!healthProfile) {
      return null;
    }

    // Build filtered data based on privacy preferences
    const aiData: any = {
      // Always include pseudonymous context to avoid leaking identifiers
      userAlias: this.buildAlias(userId),
      age: healthProfile.age,
      gender: this.redactPII(healthProfile.gender),
      activityLevel: this.redactPII(healthProfile.activityLevel),
      primaryGoal: this.redactPII(healthProfile.primaryGoal),
    };

    if (settings.includeWeight) {
      aiData.currentWeightKg = healthProfile.currentWeightKg;
      aiData.targetWeightKg = healthProfile.targetWeightKg;
      aiData.heightCm = healthProfile.heightCm;
    }

    if (settings.includeActivity) {
      aiData.sleepHoursPerDay = healthProfile.sleepHoursPerDay;
      aiData.stressLevel = this.redactPII(healthProfile.stressLevel);
      aiData.weeklyActivityGoal = healthProfile.weeklyActivityGoal;
      aiData.fitnessLevel = this.redactPII(healthProfile.fitnessLevel);
    }

    if (settings.includeDietary) {
      aiData.dietaryPreferences = this.sanitizeArray(healthProfile.dietaryPreferences);
      aiData.allergies = this.sanitizeArray(healthProfile.allergies);
      aiData.restrictions = this.sanitizeArray(healthProfile.restrictions);
    }

    if (settings.includeMedical) {
      aiData.medicalConditions = this.sanitizeArray(healthProfile.medicalConditions);
      aiData.medications = this.sanitizeArray(healthProfile.medications);
    }

    return aiData;
  }

  private sanitizeArray(values?: string[]) {
    if (!values || values.length === 0) return [];
    return values.map((v) => this.redactPII(v));
  }

  private redactPII(value?: string | null) {
    if (!value) return value;
    const withoutEmails = value.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[redacted-email]');
    const withoutPhones = withoutEmails.replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted-phone]');
    return withoutPhones.trim();
  }

  private buildAlias(userId: string) {
    const salt = process.env.ENCRYPTION_KEY || 'ai-anon-salt';
    return crypto.createHash('sha256').update(`${userId}:${salt}`).digest('hex').slice(0, 16);
  }
}
