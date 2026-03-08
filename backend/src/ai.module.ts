import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [AIController],
  providers: [AIService, PrismaService],
  exports: [AIService],
})
export class AIModule {}
