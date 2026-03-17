import { 
  Controller, 
  Get, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  UseGuards,
  Post,
} from '@nestjs/common';
import { ProfileService } from './services/profile.service';
import { AddressService } from './services/address.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('users')
@UseGuards(JwtUserGuard)
export class UsersController {
  constructor(
    private readonly profileService: ProfileService,
  ) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user.id);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Delete('profile')
  async deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    await this.profileService.deleteAccount(user.id);
    return { message: 'Account deleted successfully' };
  }
}

@Controller('addresses')
@UseGuards(JwtUserGuard)
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  async createAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressService.createAddress(user.id, dto);
  }

  @Get()
  async getAddresses(@CurrentUser() user: AuthenticatedUser) {
    return this.addressService.getAddresses(user.id);
  }

  @Patch(':id')
  async updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.updateAddress(user.id, addressId, dto);
  }

  @Delete(':id')
  async deleteAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') addressId: string,
  ) {
    await this.addressService.deleteAddress(user.id, addressId);
    return { message: 'Address deleted successfully' };
  }
}
