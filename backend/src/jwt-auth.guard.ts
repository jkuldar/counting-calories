import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from './prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private prisma: PrismaService) {
		super();
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const can = await super.canActivate(context);
		const request = context.switchToHttp().getRequest();
		const userId = request.user?.userId;

		if (userId) {
			const windowMinutes = parseInt(process.env.INACTIVITY_WINDOW_MINUTES || '15', 10);
			const now = new Date();

			const dbUser = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { lastActivityAt: true },
			});

			if (dbUser?.lastActivityAt) {
				const diffMs = now.getTime() - new Date(dbUser.lastActivityAt).getTime();
				if (diffMs > windowMinutes * 60 * 1000) {
					throw new UnauthorizedException('Access token expired due to inactivity');
				}
			}

			await this.prisma.user.update({
				where: { id: userId },
				data: { lastActivityAt: now },
			});
		}

		return can as boolean;
	}
}
