import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { PrismaService } from './prisma.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private prisma: PrismaService) {
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/auth/google/callback`
        : 'http://localhost:3000/auth/google/callback');
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, displayName } = profile;
    const email = emails[0].value;

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: '', // OAuth users don't have password
          emailVerified: true, // OAuth emails are verified
          oauthProvider: 'google',
          oauthId: id,
        },
      });
    } else if (!user.oauthProvider) {
      // Link existing user with OAuth
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: 'google',
          oauthId: id,
        },
      });
    }

    done(null, user);
  }
}
