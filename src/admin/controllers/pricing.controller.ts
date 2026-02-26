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
  ParseBoolPipe,
} from '@nestjs/common';
import { PricingService } from '../services/pricing.service';
import type { CreatePricingPolicyDto, UpdatePricingPolicyDto } from '../dto/pricing.dto';
import { JwtSuperUserGuard, AdminGuard } from '../../auth/guards/auth.guards';

@Controller('admin/pricing-policies')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post()
  async createPricingPolicy(@Body() dto: CreatePricingPolicyDto) {
    return this.pricingService.createPricingPolicy(dto);
  }

  @Get()
  async getAllPricingPolicies(
    @Query('countryId') countryId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBool = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.pricingService.getAllPricingPolicies(countryId, isActiveBool);
  }

  @Get('country/:countryId')
  async getPricingPoliciesByCountry(
    @Param('countryId') countryId: string,
    @Query('deliveryZoneType') deliveryZoneType?: string,
  ) {
    return this.pricingService.getPricingPoliciesByCountryAndZone(countryId, deliveryZoneType);
  }

  @Get('active/:countryId/:deliveryZoneType')
  async getActivePricingPolicy(
    @Param('countryId') countryId: string,
    @Param('deliveryZoneType') deliveryZoneType: string,
  ) {
    return this.pricingService.getActivePricingPolicy(countryId, deliveryZoneType);
  }

  @Get(':id')
  async getPricingPolicyById(@Param('id') id: string) {
    return this.pricingService.getPricingPolicyById(id);
  }

  @Patch(':id')
  async updatePricingPolicy(@Param('id') id: string, @Body() dto: UpdatePricingPolicyDto) {
    return this.pricingService.updatePricingPolicy(id, dto);
  }

  @Patch(':id/deactivate')
  async deactivatePricingPolicy(@Param('id') id: string) {
    return this.pricingService.deactivatePricingPolicy(id);
  }

  @Delete(':id')
  async deletePricingPolicy(@Param('id') id: string) {
    await this.pricingService.deletePricingPolicy(id);
    return { message: 'Pricing policy deleted successfully' };
  }
}
