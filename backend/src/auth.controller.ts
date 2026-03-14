import { Controller, Post, Body, Query, BadRequestException, Get, Delete, UseGuards, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TwoFAService } from './twofa.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard } from './google-auth.guard';
import { GithubAuthGuard } from './github-auth.guard';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';

type AuthenticatedRequest = Request & { user: { userId: string; email: string } };

@Controller('auth')
export class AuthController {
  private readonly oauthCodes = new Map<string, {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }>();

  constructor(
    private authService: AuthService,
    private twoFAService: TwoFAService,
  ) {}

  private createOAuthCode(tokens: { accessToken: string; refreshToken: string }): string {
    const code = randomBytes(32).toString('hex');
    this.oauthCodes.set(code, { ...tokens, expiresAt: Date.now() + 60_000 });
    setTimeout(() => this.oauthCodes.delete(code), 60_000);
    return code;
  }

  @Get('oauth/exchange')
  async exchangeOAuthCode(@Query('code') code: string) {
    if (!code) {
      throw new BadRequestException('Code required');
    }
    const entry = this.oauthCodes.get(code);
    if (!entry || entry.expiresAt < Date.now()) {
      this.oauthCodes.delete(code);
      throw new BadRequestException('Invalid or expired code');
    }
    this.oauthCodes.delete(code);
    return { accessToken: entry.accessToken, refreshToken: entry.refreshToken };
  }

  @Post('register')
  async register(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password required');
    }
    try {
      return await this.authService.register(body.email, body.password);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string; twoFactorToken?: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password required');
    }
    try {
      return await this.authService.login(body.email, body.password, body.twoFactorToken);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('verify-email')
  async verifyEmail(@Query('code') code: string) {
    if (!code) {
      throw new BadRequestException('Verification code required');
    }
    try {
      return await this.authService.verifyEmail(code);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // Also support GET for browser-based verification
  @Get('verify-email')
  async verifyEmailGet(@Query('code') code: string) {
    if (!code) {
      throw new BadRequestException('Verification code required');
    }
    try {
      const result = await this.authService.verifyEmail(code);
      return result;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token required');
    }
    try {
      return await this.authService.refreshAccessToken(body.refreshToken);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // Password Reset
  @Post('resend-verification')
  async resendVerification(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email required');
    }
    try {
      return await this.authService.resendVerification(body.email);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email required');
    }
    try {
      return await this.authService.requestPasswordReset(body.email);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    if (!body.token || !body.newPassword) {
      throw new BadRequestException('Token and new password required');
    }
    try {
      return await this.authService.resetPassword(body.token, body.newPassword);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // Google OAuth
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const tokens = await this.authService.loginWithOAuth(req.user);
    const code = this.createOAuthCode(tokens);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    res.redirect(`${frontendUrl}/?oauthCode=${code}`);
  }

  // GitHub OAuth
  @Get('github')
  @UseGuards(GithubAuthGuard)
  async githubAuth() {
    // Initiates GitHub OAuth flow
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubAuthCallback(@Req() req: Request, @Res() res: Response) {
    const tokens = await this.authService.loginWithOAuth(req.user);
    const code = this.createOAuthCode(tokens);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    res.redirect(`${frontendUrl}/?oauthCode=${code}`);
  }

  // Two-Factor Authentication
  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  async get2FAStatus(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.getUser(req.user.userId);
    return { enabled: user?.twoFactorEnabled ?? false };
  }

  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  async generate2FA(@Req() req: AuthenticatedRequest) {
    try {
      return await this.twoFAService.generateSecret(req.user.userId, req.user.email);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2FA(@Req() req: AuthenticatedRequest, @Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Token required');
    }
    try {
      return await this.twoFAService.enableTwoFactor(req.user.userId, body.token);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(@Req() req: AuthenticatedRequest, @Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Token required');
    }
    try {
      return await this.twoFAService.disableTwoFactor(req.user.userId, body.token);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    try {
      await this.authService.deleteAccount(req.user.userId);
      return { success: true, message: 'Account and all associated data deleted successfully.' };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('2fa/verify')
  async verify2FA(@Body() body: { email: string; password: string; token: string }) {
    if (!body.email || !body.password || !body.token) {
      throw new BadRequestException('Email, password and token required');
    }
    try {
      // First verify credentials
      const loginResult = await this.authService.login(body.email, body.password);

      if ('requires2FA' in loginResult && loginResult.requires2FA) {
        // Get user to verify 2FA - need to access PrismaService through AuthService
        const prisma = (this.authService as any).prisma;
        const user = await prisma.user.findUnique({
          where: { email: body.email },
        });
        
        const isValid = await this.twoFAService.verifyToken(user.id, body.token);
        if (!isValid) {
          throw new Error('Invalid 2FA token');
        }
        
        // Generate tokens after successful 2FA
        return await this.authService.generateTokens(user.id, user.email);
      }
      
      return loginResult;
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}

