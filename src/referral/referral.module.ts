import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CodeGeneratorService } from './services/code-generator.service';
import { ReferralService } from './services/referral.service';
import { CommissionService } from './services/commission.service';
import { ReferralController } from './controllers/referral.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReferralController],
  providers: [CodeGeneratorService, ReferralService, CommissionService],
  exports: [CodeGeneratorService, ReferralService, CommissionService],
})
export class ReferralModule {}
