import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GeographyService } from '../services/geography.service';
import type {
  CreateCountryDto,
  UpdateCountryDto,
  CreateGovernorateDto,
  UpdateGovernorateDto,
  CreateDelegationDto,
  UpdateDelegationDto,
} from '../dto/geography.dto';
import { JwtSuperUserGuard, AdminGuard } from '../../auth/guards/auth.guards';

@Controller('admin/geography')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class GeographyController {
  constructor(private readonly geographyService: GeographyService) {}

  // ============================================
  // COUNTRY ENDPOINTS
  // ============================================

  @Post('countries')
  async createCountry(@Body() dto: CreateCountryDto) {
    return this.geographyService.createCountry(dto);
  }

  @Get('countries')
  async getAllCountries() {
    return this.geographyService.getAllCountries();
  }

  @Get('countries/:id')
  async getCountryById(@Param('id') id: string) {
    return this.geographyService.getCountryById(id);
  }

  @Patch('countries/:id')
  async updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.geographyService.updateCountry(id, dto);
  }

  @Delete('countries/:id')
  async deleteCountry(@Param('id') id: string) {
    await this.geographyService.deleteCountry(id);
    return { message: 'Country deleted successfully' };
  }

  // ============================================
  // GOVERNORATE ENDPOINTS
  // ============================================

  @Post('governorates')
  async createGovernorate(@Body() dto: CreateGovernorateDto) {
    return this.geographyService.createGovernorate(dto);
  }

  @Get('governorates')
  async getAllGovernorates(@Query('countryId') countryId?: string) {
    return this.geographyService.getAllGovernorates(countryId);
  }

  @Get('governorates/:id')
  async getGovernorateById(@Param('id') id: string) {
    return this.geographyService.getGovernorateById(id);
  }

  @Patch('governorates/:id')
  async updateGovernorate(@Param('id') id: string, @Body() dto: UpdateGovernorateDto) {
    return this.geographyService.updateGovernorate(id, dto);
  }

  @Delete('governorates/:id')
  async deleteGovernorate(@Param('id') id: string) {
    await this.geographyService.deleteGovernorate(id);
    return { message: 'Governorate deleted successfully' };
  }

  // ============================================
  // DELEGATION ENDPOINTS
  // ============================================

  @Post('delegations')
  async createDelegation(@Body() dto: CreateDelegationDto) {
    return this.geographyService.createDelegation(dto);
  }

  @Get('delegations')
  async getAllDelegations(@Query('governorateId') governorateId?: string) {
    return this.geographyService.getAllDelegations(governorateId);
  }

  @Get('delegations/:id')
  async getDelegationById(@Param('id') id: string) {
    return this.geographyService.getDelegationById(id);
  }

  @Patch('delegations/:id')
  async updateDelegation(@Param('id') id: string, @Body() dto: UpdateDelegationDto) {
    return this.geographyService.updateDelegation(id, dto);
  }

  @Delete('delegations/:id')
  async deleteDelegation(@Param('id') id: string) {
    await this.geographyService.deleteDelegation(id);
    return { message: 'Delegation deleted successfully' };
  }
}
