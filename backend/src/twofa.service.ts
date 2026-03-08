import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from './prisma.service';

@Injectable()
export class TwoFAService {
  constructor(private prisma: PrismaService) {
    // Configure TOTP
    authenticator.options = {
      window: 1, // Allow 1 step before/after for time drift
    };
  }

  async generateSecret(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'Wellness Platform', secret);

    // Store secret temporarily (not enabled yet)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCode };
  }

  async enableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.twoFactorSecret) {
      throw new Error('2FA secret not found');
    }

    // Verify the token
    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new Error('Invalid 2FA token');
    }

    // Enable 2FA
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: '2FA enabled successfully' };
  }

  async disableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.twoFactorSecret) {
      throw new Error('2FA not configured');
    }

    // Verify the token before disabling
    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new Error('Invalid 2FA token');
    }

    // Disable 2FA and remove secret
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    return { message: '2FA disabled successfully' };
  }

  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.twoFactorSecret || !user.twoFactorEnabled) {
      return false;
    }

    return authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });
  }
}
