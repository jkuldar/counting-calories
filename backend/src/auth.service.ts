import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { TwoFAService } from './twofa.service';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  // Nodemailer SMTP transport (used only when RESEND_API_KEY is NOT set).
  // Supports both SMTP_* and EMAIL_* env var naming conventions.
  private mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587'),
    secure: (process.env.SMTP_SECURE || process.env.EMAIL_SECURE) === 'true',
    auth: (process.env.SMTP_USER || process.env.EMAIL_USER)
      ? { user: process.env.SMTP_USER || process.env.EMAIL_USER, pass: process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD }
      : undefined,
  });

  /** Resolve the frontend base URL at runtime so verification links work on Railway */
  private get frontendUrl(): string {
    const configured = process.env.FRONTEND_URL || process.env.FRONT_URL;
    if (configured) return configured.replace(/\/$/, '');
    // Fallback: Railway injects RAILWAY_PUBLIC_DOMAIN for each service but we need the
    // *frontend* service URL.  Best effort: derive from the backend public domain by
    // replacing "backend" with "frontend" in the hostname.
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      const backendHost = process.env.RAILWAY_PUBLIC_DOMAIN;
      const frontendHost = backendHost.replace('backend', 'frontend');
      return `https://${frontendHost}`;
    }
    return 'http://localhost:5173';
  }

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private twoFAService: TwoFAService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error('User already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: { email, passwordHash, verificationCode },
    });

    await this.sendVerificationEmail(email, verificationCode);

    return { message: 'User registered. Check your email for verification link.' };
  }

  async login(email: string, password: string, twoFactorToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if OAuth user trying to login with password
    if (user.oauthProvider && !user.passwordHash) {
      throw new Error(`Please login with ${user.oauthProvider}`);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    if (!user.emailVerified) {
      throw new Error('Email not verified');
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorToken) {
        return { requires2FA: true, message: '2FA token required' };
      }

      const valid2FA = await this.twoFAService.verifyToken(user.id, twoFactorToken);
      if (!valid2FA) {
        throw new Error('Invalid 2FA token');
      }
    }

    return this.generateTokens(user.id, user.email);
  }

  async loginWithOAuth(user: any) {
    return this.generateTokens(user.id, user.email);
  }

  async getUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async generateTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '7d' },
    );

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: hashedRefreshToken,
        lastActivityAt: new Date(),
      },
    });

    return { accessToken, refreshToken };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Don't reveal whether the email exists
    if (!user) return { message: 'If that email is registered, a new verification link has been sent.' };

    if (user.emailVerified) {
      throw new Error('This email is already verified. You can sign in.');
    }

    const verificationCode = randomBytes(32).toString('hex');
    await this.prisma.user.update({ where: { id: user.id }, data: { verificationCode } });
    await this.sendVerificationEmail(email, verificationCode);

    return { message: 'If that email is registered, a new verification link has been sent.' };
  }

  async verifyEmail(verificationCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationCode },
    });

    if (!user) {
      throw new Error('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationCode: null },
    });

    return { message: 'Email verified successfully' };
  }

  async refreshAccessToken(oldRefreshToken: string) {
    try {
      const payload = this.jwtService.verify(oldRefreshToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken) {
        throw new Error('Invalid refresh token');
      }

      const matches = await bcrypt.compare(oldRefreshToken, user.refreshToken);
      if (!matches) {
        throw new Error('Invalid refresh token');
      }

      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' },
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastActivityAt: new Date() },
      });

      return { accessToken };
    } catch {
      throw new Error('Refresh token expired or invalid');
    }
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      // Don't reveal if user exists
      return { message: 'If the email exists, a reset link has been sent' };
    }

    if (user.oauthProvider && !user.passwordHash) {
      throw new Error('OAuth users cannot reset password');
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    await this.sendPasswordResetEmail(email, resetToken);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { resetToken },
    });

    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  private async sendVerificationEmail(email: string, code: string): Promise<void> {
    const verificationUrl = `${this.frontendUrl}/verify?code=${code}`;

    // Log the verification URL so it's visible in Railway logs as a fallback
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  EMAIL VERIFICATION');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Email: ${email}`);
    console.log(`║  Verify URL: ${verificationUrl}`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    await this.sendEmail({
      to: email,
      subject: 'Verify your Numbers Don\'t Lie account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem">
          <h2 style="color:#6a1b9a">Numbers Don't Lie</h2>
          <p>Thanks for signing up! Click the button below to verify your email address.</p>
          <a href="${verificationUrl}"
             style="display:inline-block;margin:1.5rem 0;padding:0.75rem 1.5rem;
                    background:#6a1b9a;color:#fff;border-radius:6px;
                    text-decoration:none;font-weight:600">
            Verify my email
          </a>
          <p style="color:#666;font-size:0.9rem">Or copy this link into your browser:</p>
          <p style="word-break:break-all;font-size:0.85rem;color:#444">${verificationUrl}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:2rem 0">
          <p style="color:#999;font-size:0.8rem">If you didn't create this account you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  private async sendPasswordResetEmail(email: string, resetToken: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

    await this.sendEmail({
      to: email,
      subject: 'Reset your Numbers Don\'t Lie password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem">
          <h2 style="color:#6a1b9a">Numbers Don't Lie</h2>
          <p>You requested a password reset. Click the button below to choose a new password.</p>
          <a href="${resetUrl}"
             style="display:inline-block;margin:1.5rem 0;padding:0.75rem 1.5rem;
                    background:#6a1b9a;color:#fff;border-radius:6px;
                    text-decoration:none;font-weight:600">
            Reset my password
          </a>
          <p style="color:#666;font-size:0.9rem">This link expires in 1 hour.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:2rem 0">
          <p style="color:#999;font-size:0.8rem">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  /**
   * Unified email sender.
   * - Uses Resend REST API when RESEND_API_KEY is set (recommended for production).
   * - Falls back to nodemailer/SMTP when SMTP_HOST is configured.
   * - Logs a warning and skips silently when neither is available.
   */
  /** Returns true only if the email was successfully delivered. */
  private async sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
    const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'Numbers Don\'t Lie <onboarding@resend.dev>';

    if (process.env.RESEND_API_KEY) {
      // ── Resend REST API ──────────────────────────────────────────────────────
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from, to, subject, html }),
        });
        if (!res.ok) {
          const body = await res.text();
          console.error('Resend API error:', res.status, body);
          return false;
        }
        console.log(`✉️  Email sent via Resend to ${to}`);
        return true;
      } catch (err) {
        console.error('Resend fetch failed:', err);
        return false;
      }
    }

    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    if (smtpHost && smtpHost !== 'localhost') {
      // ── Nodemailer SMTP fallback ─────────────────────────────────────────────
      try {
        await this.mailTransporter.sendMail({ from, to, subject, html });
        console.log(`✉️  Email sent via SMTP to ${to}`);
        return true;
      } catch (error) {
        console.error('SMTP send failed:', error);
        return false;
      }
    }

    // No transport configured
    console.warn(`⚠️  No email transport configured. Email to ${to} was NOT sent.`);
    return false;
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
