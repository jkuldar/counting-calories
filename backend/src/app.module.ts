import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProtectedController } from './protected.controller';
import { PrismaService } from './prisma.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { GithubStrategy } from './github.strategy';
import { TwoFAService } from './twofa.service';
import { HealthProfileController } from './health-profile.controller';
import { HealthProfileService } from './health-profile.service';
import { PrivacySettingsController } from './privacy-settings.controller';
import { PrivacySettingsService } from './privacy-settings.service';
import { AIModule } from './ai.module';
import { MealPlanModule } from './meal-plan.module';

const oauthStrategies: any[] = [JwtStrategy];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthStrategies.push(GoogleStrategy);
} else {
  // eslint-disable-next-line no-console
  console.warn('Google OAuth disabled: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set');
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthStrategies.push(GithubStrategy);
} else {
  // eslint-disable-next-line no-console
  console.warn('GitHub OAuth disabled: GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET not set');
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 60,
        },
      ],
    }),
    AIModule,
    MealPlanModule,
  ],
  controllers: [
    HealthController, 
    AuthController, 
    ProtectedController,
    HealthProfileController,
    PrivacySettingsController,
  ],
  providers: [
    HealthService,
    AuthService,
    PrismaService,
    ...oauthStrategies,
    TwoFAService,
    HealthProfileService,
    PrivacySettingsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
