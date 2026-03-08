import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { PrismaService } from './prisma.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private prisma: PrismaService) {
    const callbackURL =
      process.env.GITHUB_CALLBACK_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/auth/github/callback`
        : 'http://localhost:3000/auth/github/callback');
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL,
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: Function,
  ): Promise<any> {
    const { id, emails, username } = profile;
    const email = emails[0].value;

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: '', // OAuth users don't have password
          emailVerified: true, // OAuth emails are verified
          oauthProvider: 'github',
          oauthId: id,
        },
      });
    } else if (!user.oauthProvider) {
      // Link existing user with OAuth
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: 'github',
          oauthId: id,
        },
      });
    }

    done(null, user);
  }
}
