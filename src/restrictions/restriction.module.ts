import { Module } from '@nestjs/common';
import { RestrictionController, UserRestrictionController } from './restriction.controller';
import { RestrictionService } from './restriction.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RestrictionController, UserRestrictionController],
  providers: [RestrictionService],
  exports: [RestrictionService],
})
export class RestrictionModule {}
