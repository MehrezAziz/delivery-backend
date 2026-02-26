import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CustomerServiceManagementService } from '../services/customer-service-management.service';
import type {
  CreateCustomerServiceDto,
  UpdateCustomerServiceDto,
  UpdateCustomerServiceRolesDto,
} from '../dto/customer-service.dto';
import { JwtSuperUserGuard, AdminGuard } from '../../auth/guards/auth.guards';

@Controller('admin/customer-services')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class CustomerServiceManagementController {
  constructor(
    private readonly customerServiceManagementService: CustomerServiceManagementService,
  ) {}

  /**
   * Create a new customer service account
   */
  @Post()
  async createCustomerService(@Body() dto: CreateCustomerServiceDto) {
    return this.customerServiceManagementService.createCustomerService(dto);
  }

  /**
   * Get all customer service accounts
   */
  @Get()
  async getAllCustomerServices() {
    return this.customerServiceManagementService.getAllCustomerServices();
  }

  /**
   * Get customer service by ID
   */
  @Get(':id')
  async getCustomerServiceById(@Param('id') id: string) {
    return this.customerServiceManagementService.getCustomerServiceById(id);
  }

  /**
   * Update customer service account details
   */
  @Patch(':id')
  async updateCustomerService(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceDto,
  ) {
    return this.customerServiceManagementService.updateCustomerService(id, dto);
  }

  /**
   * Update customer service roles (replace all roles)
   */
  @Patch(':id/roles')
  async updateCustomerServiceRoles(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerServiceRolesDto,
  ) {
    return this.customerServiceManagementService.updateCustomerServiceRoles(id, dto);
  }

  /**
   * Add a single role to customer service
   */
  @Post(':id/roles/:role')
  async addRole(@Param('id') id: string, @Param('role') role: string) {
    return this.customerServiceManagementService.addRole(id, role as any);
  }

  /**
   * Remove a single role from customer service
   */
  @Delete(':id/roles/:role')
  async removeRole(@Param('id') id: string, @Param('role') role: string) {
    return this.customerServiceManagementService.removeRole(id, role as any);
  }

  /**
   * Toggle customer service account status (ACTIVE/BLOCKED)
   */
  @Patch(':id/toggle-status')
  async toggleStatus(@Param('id') id: string) {
    return this.customerServiceManagementService.toggleStatus(id);
  }

  /**
   * Delete customer service account
   */
  @Delete(':id')
  async deleteCustomerService(@Param('id') id: string) {
    await this.customerServiceManagementService.deleteCustomerService(id);
    return { message: 'Customer service account deleted successfully' };
  }
}
