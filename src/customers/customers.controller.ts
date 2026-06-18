import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/customer.dto';
import { UpdateNotificationPreferencesDto } from './dto/notification-preferences.dto';
import { SetupCustomerDto } from './dto/setup-customer.dto';
import { UpsertCountryPreferenceDto } from './dto/country-preference.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, JwtSuperUserGuard, CustomerGuard, AdminGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Get authenticated customer's own profile
   */
  @UseGuards(JwtUserGuard, CustomerGuard)
  @Get('me')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getCustomerProfile(user.id);
  }

  /**
   * Update authenticated customer's profile
   */
  @UseGuards(JwtUserGuard, CustomerGuard)
  @Patch('me')
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.updateCustomerProfile(user.id, dto);
  }

  /**
   * POST /customers/me/setup
   * Choose country (creates wallet) + optional address. Status: CREATED → VERIFIED.
   */
  @UseGuards(JwtUserGuard, CustomerGuard)
  @Get('me/notification-preferences')
  async getNotificationPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getNotificationPreferences(user.id);
  }

  @UseGuards(JwtUserGuard, CustomerGuard)
  @Patch('me/notification-preferences')
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.customersService.updateNotificationPreferences(user.id, dto);
  }

  @UseGuards(JwtUserGuard, CustomerGuard)
  @Get('me/country-preferences')
  async getCountryPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.customersService.getCountryPreferences(user.id);
  }

  @UseGuards(JwtUserGuard, CustomerGuard)
  @Put('me/country-preferences/:countryId')
  async upsertCountryPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Param('countryId') countryId: string,
    @Body() dto: UpsertCountryPreferenceDto,
  ) {
    return this.customersService.upsertCountryPreference(user.id, countryId, dto);
  }

  @UseGuards(JwtUserGuard, CustomerGuard)
  @Post('me/setup')
  async setupCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetupCustomerDto,
  ) {
    return this.customersService.setupCustomer(user.id, dto);
  }
}

@Controller('admin/customers')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Get all customers with pagination
   */
  @Get()
  async getAllCustomers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.customersService.getAllCustomers(page, limit);
  }

  /**
   * Get customer statistics
   */
  @Get('stats')
  async getCustomerStats() {
    return this.customersService.getCustomerStats();
  }

  /**
   * Search customers by phone or name
   */
  @Get('search')
  async searchCustomers(@Query('q') query: string) {
    return this.customersService.searchCustomers(query);
  }

  /**
   * Get customer by ID
   */
  @Get(':id')
  async getCustomerById(@Param('id') customerId: string) {
    return this.customersService.getCustomerById(customerId);
  }

  /**
   * Delete customer (soft delete)
   */
  @Delete(':id')
  async deleteCustomer(@Param('id') customerId: string) {
    await this.customersService.deleteCustomer(customerId);
    return { message: 'Customer deleted successfully' };
  }
}
