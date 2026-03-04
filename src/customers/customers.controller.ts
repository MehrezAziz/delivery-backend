import {
  Controller,
  Get,
  Patch,
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
