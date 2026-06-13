import { Module } from '@nestjs/common';
import { GeographyController } from './geography.controller';
import { GeographyService } from './geography.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GeographyController],
  providers: [GeographyService],
  exports: [GeographyService],
})
export class GeographyModule {}
