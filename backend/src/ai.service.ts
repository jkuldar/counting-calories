import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { createHash } from 'crypto';
import { decryptArray } from './encryption.util';

interface HealthContext {
    userId: string;
    demographics?: {
    age?: number;
    gender?: string;
    };
    physical?: {
    heightCm?: number;
    currentWeightKg?: number;
    targetWeightKg?: number;
    bmi?: number;
    bmiClass?: string;
    };
    lifestyle?: {
    activityLevel?: string;
    sleepHoursPerDay?: number;
    stressLevel?: string;
    };
    dietary?: {
    preferences?: string[];
    allergies?: string[];
    restrictions?: string[];
    };
    goals?: {
    primaryGoal?: string;
    targetDate?: Date;
    weeklyActivityGoal?: number;
    };
    fitness?: {
    fitnessLevel?: string;
    medicalConditions?: string[];
    };
    progress?: {
    wellnessScore?: number;
    progressPercent?: number;
    activityStreakDays?: number;
    habitStreakDays?: number;
    };
    recentActivity?: Array<{
    type?: string;
    durationMin?: number;
    intensity?: string;
    loggedAt: Date;
    }>;
    weightTrend?: Array<{
    weightKg: number;
    recordedAt: Date;
    }>;
}

interface AIInsightResult {
    id: string;
    response: string;
    priority: string;
    isValid: boolean;
    violatesRestrictions: boolean;
    validationNotes?: string;
    fromCache: boolean;
    model: string;
    createdAt: Date;
}

interface AIInsightResponse {
  insight: AIInsightResult | null;
  reason: 'ok' | 'no_profile' | 'no_consent' | 'no_api_key' | 'unavailable';
  message: string;
}

@Injectable()
export class AIService {
    private readonly logger = new Logger(AIService.name);
    private readonly CACHE_DURATION_HOURS = 24;
    private readonly MAX_CONTEXT_LENGTH = 3000;
    private readonly AI_MODEL = 'gpt-4.1-mini';

    constructor(private prisma: PrismaService) {}

    /**
   * Get AI insight with caching and fallback
   */
    async getInsight(userId: string): Promise<AIInsightResponse> {
    try {
      // Build health context (throws specific errors for missing profile/consent)
        const context = await this.buildHealthContext(userId);
        
      // Generate context hash for cache lookup
      const contextHash = this.generateContextHash(context);

      // Try to get from cache first
      const cached = await this.getCachedInsight(userId, contextHash);
      if (cached) {
        this.logger.log(`Using cached insight for user ${userId}`);
        return {
          insight: { ...cached, fromCache: true },
          reason: 'ok',
          message: 'Cached insight returned',
        };
      }

      // Generate new insight
      const insight = await this.generateInsight(userId, context, contextHash);
      return { insight, reason: 'ok', message: 'New insight generated' };

    } catch (error) {
      const msg = (error as Error).message || '';

      // Specific known failure reasons
      if (msg === 'Health profile not found') {
        return { insight: null, reason: 'no_profile', message: 'Complete your health profile to receive AI insights.' };
      }
      if (msg === 'AI data sharing is disabled') {
        return { insight: null, reason: 'no_consent', message: 'Enable AI insights in Privacy Settings to receive recommendations.' };
      }
      if (msg === 'OPENAI_API_KEY not configured') {
        // Fallback to last cached insight before giving up
        const fallback = await this.getLastValidInsight(userId);
        if (fallback) {
          return { insight: { ...fallback, fromCache: true }, reason: 'ok', message: 'Cached insight returned' };
        }
        return { insight: null, reason: 'no_api_key', message: 'AI service is not configured. Set OPENAI_API_KEY in backend environment variables.' };
      }

      this.logger.error(`Failed to get insight for user ${userId}:`, error);

      // Generic fallback: return last cached insight if available
      const fallback = await this.getLastValidInsight(userId);
      if (fallback) {
        this.logger.log(`Using fallback insight for user ${userId}`);
        return { insight: { ...fallback, fromCache: true }, reason: 'ok', message: 'Cached insight returned' };
      }

      return { insight: null, reason: 'unavailable', message: 'AI service is temporarily unavailable. Please try again later.' };
    }
  }

  /**
   * Build health context from user data with PII removal
   */
  private async buildHealthContext(userId: string): Promise<HealthContext> {
    // Get user profile
    const profile = await this.prisma.healthProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new Error('Health profile not found');
    }

    // Check consent and shareWithAI setting
    const privacyEarly = await this.prisma.privacySettings.findUnique({ where: { userId } });
    if (privacyEarly && privacyEarly.shareWithAI === false) {
      throw new Error('AI data sharing is disabled');
    }
    if (!profile.consentGiven) {
      throw new Error('AI data sharing is disabled');
    }
    const privacy = await this.prisma.privacySettings.findUnique({
      where: { userId },
    });

    const includeWeight = privacy?.includeWeight ?? true;
    const includeActivity = privacy?.includeActivity ?? true;
    const includeDietary = privacy?.includeDietary ?? true;
    const includeMedical = privacy?.includeMedical ?? false;

    // Build context with PII removal (no email, name, actual userId)
    const context: HealthContext = {
      userId: this.anonymizeUserId(userId), // Use hash instead of real ID
    };

    // Demographics (minimal PII)
    if (profile.age || profile.gender) {
      context.demographics = {
        age: profile.age ?? undefined,
        gender: profile.gender ?? undefined,
      };
    }

    // Physical metrics
    if (includeWeight && (profile.heightCm || profile.currentWeightKg)) {
      context.physical = {
        heightCm: profile.heightCm ?? undefined,
        currentWeightKg: profile.currentWeightKg ?? undefined,
        targetWeightKg: profile.targetWeightKg ?? undefined,
        bmi: profile.bmi ?? undefined,
        bmiClass: profile.bmiClass ?? undefined,
      };
    }

    // Lifestyle
    if (profile.activityLevel || profile.sleepHoursPerDay || profile.stressLevel) {
      context.lifestyle = {
        activityLevel: profile.activityLevel ?? undefined,
        sleepHoursPerDay: profile.sleepHoursPerDay ?? undefined,
        stressLevel: profile.stressLevel ?? undefined,
      };
    }

    // Dietary (respecting privacy settings)
    if (includeDietary && (profile.dietaryPreferences.length > 0 || profile.allergies.length > 0)) {
      context.dietary = {
        preferences: profile.dietaryPreferences,
        allergies: profile.allergies,
        restrictions: profile.restrictions,
      };
    }

    // Goals
    if (profile.primaryGoal) {
      context.goals = {
        primaryGoal: profile.primaryGoal,
        targetDate: profile.targetDate ?? undefined,
        weeklyActivityGoal: profile.weeklyActivityGoal ?? undefined,
      };
    }

    // Fitness (medical only if explicitly allowed)
    if (profile.fitnessLevel) {
      context.fitness = {
        fitnessLevel: profile.fitnessLevel,
        medicalConditions: includeMedical ? decryptArray(profile.medicalConditions || []) : undefined,
      };
    }

    // Progress metrics
    context.progress = {
      wellnessScore: profile.wellnessScore ?? undefined,
      progressPercent: profile.progressPercent ?? undefined,
      activityStreakDays: profile.activityStreakDays ?? undefined,
      habitStreakDays: profile.habitStreakDays ?? undefined,
    };

    // Recent activity (last 7 days)
    if (includeActivity) {
      const recentActivities = await this.prisma.activityEntry.findMany({
        where: {
          userId,
          loggedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { loggedAt: 'desc' },
        take: 10,
        select: {
          type: true,
          durationMin: true,
          intensity: true,
          loggedAt: true,
        },
      });
      context.recentActivity = recentActivities.map(activity => ({
        type: activity.type ?? undefined,
        durationMin: activity.durationMin ?? undefined,
        intensity: activity.intensity ?? undefined,
        loggedAt: activity.loggedAt,
      }));
    }

    // Weight trend (last 30 days)
    if (includeWeight) {
      const weightHistory = await this.prisma.weightHistory.findMany({
        where: {
          userId,
          recordedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { recordedAt: 'desc' },
        take: 10,
        select: {
          weightKg: true,
          recordedAt: true,
        },
      });
      context.weightTrend = weightHistory;
    }

    return context;
  }

  /**
   * Generate context hash for caching
   */
  private generateContextHash(context: HealthContext): string {
    const normalized = JSON.stringify(context, Object.keys(context).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Anonymize user ID (replace with hash)
   */
  private anonymizeUserId(userId: string): string {
    return createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  /**
   * Get cached insight if available and not expired
   */
  private async getCachedInsight(userId: string, contextHash: string): Promise<any | null> {
    const cached = await this.prisma.aIInsight.findFirst({
      where: {
        userId,
        contextHash,
        isValid: true,
        violatesRestrictions: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return cached;
  }

  /**
   * Get last valid insight as fallback
   */
  private async getLastValidInsight(userId: string): Promise<any | null> {
    return this.prisma.aIInsight.findFirst({
      where: {
        userId,
        isValid: true,
        violatesRestrictions: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Generate new AI insight
   */
  private async generateInsight(
    userId: string,
    context: HealthContext,
    contextHash: string,
  ): Promise<AIInsightResult> {
    const startTime = Date.now();

    // Build prompt
    const prompt = this.buildPrompt(context);

    // Call AI service (OpenAI API)
    let response: string;
    let tokensUsed = 0;

    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      // Call OpenAI API
      const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.AI_MODEL,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await apiResponse.json();
      response = data.choices[0]?.message?.content || 'No response generated';
      tokensUsed = data.usage?.total_tokens || 0;

    } catch (error) {
      this.logger.error('OpenAI API call failed:', error);
      throw error;
    }

    const responseTimeMs = Date.now() - startTime;

    // Validate response
    const validation = this.validateResponse(response, context);

    // Calculate priority
    const priority = this.calculatePriority(context, response);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION_HOURS * 60 * 60 * 1000);

    // Save to database
    const insight = await this.prisma.aIInsight.create({
      data: {
        userId,
        prompt,
        response,
        contextHash,
        priority,
        isValid: validation.isValid,
        violatesRestrictions: validation.violatesRestrictions,
        validationNotes: validation.notes,
        model: this.AI_MODEL,
        tokensUsed,
        responseTimeMs,
        expiresAt,
      },
    });

    return {
      id: insight.id,
      response: insight.response,
      priority: insight.priority,
      isValid: insight.isValid,
      violatesRestrictions: insight.violatesRestrictions,
      validationNotes: insight.validationNotes ?? undefined,
      fromCache: false,
      model: insight.model,
      createdAt: insight.createdAt,
    };
  }

  /**
   * Build AI prompt from context
   */
  private buildPrompt(context: HealthContext): string {
    let prompt = 'Based on the following health profile, provide personalized health and wellness recommendations:\n\n';

    // Demographics
    if (context.demographics) {
      prompt += `Demographics:\n`;
      if (context.demographics.age) prompt += `- Age: ${context.demographics.age}\n`;
      if (context.demographics.gender) prompt += `- Gender: ${context.demographics.gender}\n`;
      prompt += '\n';
    }

    // Physical metrics
    if (context.physical) {
      prompt += `Physical Metrics:\n`;
      if (context.physical.heightCm) prompt += `- Height: ${context.physical.heightCm} cm\n`;
      if (context.physical.currentWeightKg) prompt += `- Current Weight: ${context.physical.currentWeightKg} kg\n`;
      if (context.physical.targetWeightKg) prompt += `- Target Weight: ${context.physical.targetWeightKg} kg\n`;
      if (context.physical.bmi) prompt += `- BMI: ${context.physical.bmi} (${context.physical.bmiClass})\n`;
      prompt += '\n';
    }

    // Lifestyle
    if (context.lifestyle) {
      prompt += `Lifestyle:\n`;
      if (context.lifestyle.activityLevel) prompt += `- Activity Level: ${context.lifestyle.activityLevel}\n`;
      if (context.lifestyle.sleepHoursPerDay) prompt += `- Sleep: ${context.lifestyle.sleepHoursPerDay} hours/day\n`;
      if (context.lifestyle.stressLevel) prompt += `- Stress Level: ${context.lifestyle.stressLevel}\n`;
      prompt += '\n';
    }

    // Dietary
    if (context.dietary) {
      prompt += `Dietary Information:\n`;
      if (context.dietary.preferences && context.dietary.preferences.length > 0) {
        prompt += `- Preferences: ${context.dietary.preferences.join(', ')}\n`;
      }
      if (context.dietary.allergies && context.dietary.allergies.length > 0) {
        prompt += `- Allergies: ${context.dietary.allergies.join(', ')}\n`;
      }
      if (context.dietary.restrictions && context.dietary.restrictions.length > 0) {
        prompt += `- Restrictions: ${context.dietary.restrictions.join(', ')}\n`;
      }
      prompt += '\n';
    }

    // Goals
    if (context.goals) {
      prompt += `Goals:\n`;
      if (context.goals.primaryGoal) prompt += `- Primary Goal: ${context.goals.primaryGoal}\n`;
      if (context.goals.targetDate) prompt += `- Target Date: ${context.goals.targetDate.toISOString().split('T')[0]}\n`;
      if (context.goals.weeklyActivityGoal) prompt += `- Weekly Activity Goal: ${context.goals.weeklyActivityGoal} times/week\n`;
      prompt += '\n';
    }

    // Fitness
    if (context.fitness) {
      prompt += `Fitness Assessment:\n`;
      if (context.fitness.fitnessLevel) prompt += `- Fitness Level: ${context.fitness.fitnessLevel}\n`;
      if (context.fitness.medicalConditions && context.fitness.medicalConditions.length > 0) {
        prompt += `- Medical Considerations: ${context.fitness.medicalConditions.join(', ')}\n`;
      }
      prompt += '\n';
    }

    // Progress
    if (context.progress) {
      prompt += `Current Progress:\n`;
      if (context.progress.wellnessScore !== undefined) prompt += `- Wellness Score: ${context.progress.wellnessScore}/100\n`;
      if (context.progress.progressPercent !== undefined) prompt += `- Goal Progress: ${context.progress.progressPercent}%\n`;
      if (context.progress.activityStreakDays !== undefined) prompt += `- Activity Streak: ${context.progress.activityStreakDays} days\n`;
      prompt += '\n';
    }

    // Recent activity
    if (context.recentActivity && context.recentActivity.length > 0) {
      prompt += `Recent Activity (last 7 days):\n`;
      context.recentActivity.forEach((activity) => {
        prompt += `- ${activity.type || 'Activity'}: ${activity.durationMin}min, ${activity.intensity || 'moderate'} intensity\n`;
      });
      prompt += '\n';
    }

    // Weight trend
    if (context.weightTrend && context.weightTrend.length > 0) {
      prompt += `Weight Trend (last 30 days):\n`;
      const latest = context.weightTrend[0];
      const oldest = context.weightTrend[context.weightTrend.length - 1];
      const change = latest.weightKg - oldest.weightKg;
      prompt += `- Latest: ${latest.weightKg} kg\n`;
      prompt += `- Change: ${change > 0 ? '+' : ''}${change.toFixed(1)} kg\n`;
      prompt += '\n';
    }

    prompt += 'Please provide:\n';
    prompt += '1. A brief assessment of their current progress\n';
    prompt += '2. 2-3 specific, actionable recommendations\n';
    prompt += '3. Encouragement and next steps\n';
    prompt += '\nKeep the response concise, practical, and motivating. Focus on sustainable habits.';

    // Truncate if too long
    if (prompt.length > this.MAX_CONTEXT_LENGTH) {
      prompt = prompt.substring(0, this.MAX_CONTEXT_LENGTH) + '...';
    }

    return prompt;
  }

  /**
   * Get system prompt for AI
   */
  private getSystemPrompt(): string {
    return `You are a knowledgeable health and wellness advisor. Provide personalized, evidence-based recommendations that are:
- Safe and appropriate for the individual's health profile
- Realistic and sustainable
- Respectful of dietary restrictions and medical conditions
- Focused on long-term wellness rather than quick fixes
- Encouraging and motivating

CRITICAL SAFETY RULES:
- NEVER recommend anything that contradicts stated allergies or dietary restrictions
- NEVER suggest unsafe weight loss rates (>1 kg/week without medical supervision)
- NEVER provide medical diagnosis or treatment advice
- ALWAYS emphasize consulting healthcare providers for medical concerns
- ALWAYS respect the user's stated goals and preferences

Keep responses concise (200-300 words) and actionable.`;
  }

  /**
   * Validate AI response against health constraints
   */
  private validateResponse(response: string, context: HealthContext): {
    isValid: boolean;
    violatesRestrictions: boolean;
    notes?: string;
  } {
    const issues: string[] = [];
    let violatesRestrictions = false;

    // Check for dietary restriction violations
    if (context.dietary?.restrictions) {
      for (const restriction of context.dietary.restrictions) {
        const restrictionLower = restriction.toLowerCase();
        const responseLower = response.toLowerCase();
        
        // Check if restricted food is mentioned
        if (responseLower.includes(restrictionLower)) {
          issues.push(`Mentions restricted item: ${restriction}`);
          violatesRestrictions = true;
        }
      }
    }

    // Check for allergy violations
    if (context.dietary?.allergies) {
      for (const allergy of context.dietary.allergies) {
        const allergyLower = allergy.toLowerCase();
        const responseLower = response.toLowerCase();
        
        if (responseLower.includes(allergyLower)) {
          issues.push(`Mentions allergen: ${allergy}`);
          violatesRestrictions = true;
        }
      }
    }

    // Check if response addresses the user's goal
    if (context.goals?.primaryGoal) {
      const goalKeywords = this.getGoalKeywords(context.goals.primaryGoal);
      const mentionsGoal = goalKeywords.some(keyword => 
        response.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (!mentionsGoal) {
        issues.push('Does not clearly address stated goal');
      }
    }

    // Check for unsafe weight loss recommendations
    const unsafeWeightLossPatterns = [
      /lose.*(\d+)\s*(kg|kilograms?|pounds?|lbs).*week/i,
      /drop.*(\d+)\s*(kg|kilograms?|pounds?|lbs).*quickly/i,
    ];

    for (const pattern of unsafeWeightLossPatterns) {
      const match = response.match(pattern);
      if (match) {
        const amount = parseInt(match[1]);
        if (amount > 1) { // More than 1 kg per week
          issues.push('Recommends unsafe weight loss rate');
          violatesRestrictions = true;
        }
      }
    }

    // Check for hallucination markers (impossible claims)
    const hallucinationPatterns = [
      /lose.*weight.*overnight/i,
      /miracle/i,
      /instant.*results/i,
      /100%.*guaranteed/i,
    ];

    for (const pattern of hallucinationPatterns) {
      if (pattern.test(response)) {
        issues.push('Contains unrealistic claims');
      }
    }

    return {
      isValid: issues.length === 0,
      violatesRestrictions,
      notes: issues.length > 0 ? issues.join('; ') : undefined,
    };
  }

  /**
   * Get keywords related to a goal
   */
  private getGoalKeywords(goal: string): string[] {
    const keywordMap: Record<string, string[]> = {
      lose_weight: ['weight loss', 'lose weight', 'reduce weight', 'calorie deficit', 'fat loss'],
      gain_weight: ['weight gain', 'gain weight', 'build mass', 'calorie surplus'],
      maintain: ['maintain', 'maintenance', 'current weight'],
      build_muscle: ['muscle', 'strength', 'resistance', 'training', 'protein'],
      improve_fitness: ['fitness', 'cardio', 'endurance', 'stamina', 'conditioning'],
    };

    return keywordMap[goal] || [];
  }

  /**
   * Calculate priority based on context and response
   */
  private calculatePriority(context: HealthContext, response: string): string {
    let score = 0;

    // High priority if BMI is in unhealthy range
    if (context.physical?.bmiClass) {
      const unhealthyCategories = ['underweight', 'obese', 'severely_obese'];
      if (unhealthyCategories.some(cat => context.physical?.bmiClass?.includes(cat))) {
        score += 3;
      }
    }

    // High priority if medical conditions present
    if (context.fitness?.medicalConditions && context.fitness.medicalConditions.length > 0) {
      score += 2;
    }

    // Medium priority if goal is time-sensitive
    if (context.goals?.targetDate) {
      const daysUntilTarget = Math.floor(
        (context.goals.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilTarget < 30) {
        score += 2;
      }
    }

    // Medium priority if wellness score is low
    if (context.progress?.wellnessScore !== undefined && context.progress.wellnessScore < 50) {
      score += 2;
    }

    // Low priority if on track
    if (context.progress?.progressPercent !== undefined && context.progress.progressPercent > 80) {
      score -= 1;
    }

    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /**
   * Get all insights for a user
   */
  async getUserInsights(userId: string, limit = 10): Promise<any[]> {
    return this.prisma.aIInsight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        response: true,
        priority: true,
        isValid: true,
        violatesRestrictions: true,
        validationNotes: true,
        model: true,
        createdAt: true,
      },
    });
  }

  /**
   * Invalidate cached insights for a user (e.g., when profile changes)
   */
  async invalidateCache(userId: string): Promise<void> {
    await this.prisma.aIInsight.updateMany({
      where: {
        userId,
        expiresAt: { gte: new Date() },
      },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });
  }
}
