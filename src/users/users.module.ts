import { Module } from '@nestjs/common';
import { UsersController, AddressController } from './users.controller';
import { UsersService } from './users.service';
import { ProfileService } from './services/profile.service';
import { AddressService } from './services/address.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, AddressController],
  providers: [
    UsersService,
    ProfileService,
    AddressService,
  ],
  exports: [ProfileService, AddressService],
})
export class UsersModule {}
