import { Module } from '@nestjs/common';
import { RestrictionController } from './restriction.controller';
import { RestrictionService } from './restriction.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RestrictionController],
  providers: [RestrictionService],
  exports: [RestrictionService],
})
export class RestrictionModule {}
