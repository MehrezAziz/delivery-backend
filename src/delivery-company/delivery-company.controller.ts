import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtSuperUserGuard, StaffGuard } from '../auth/guards/auth.guards';
import { DeliveryCompanyApiKeyGuard } from './delivery-company-auth.guard';
import { DeliveryCompanyService } from './delivery-company.service';
import {
  CreateDeliveryCompanyAddressDto,
  CreateDeliveryCompanyApiKeyDto,
  CreateDeliveryCompanyDto,
  CreateDeliveryCompanyOrderDto,
  CreateDeliveryCompanyRefundRequestDto,
  UpdateDeliveryCompanyDto,
} from './dto/delivery-company.dto';
import { ReturnDepositFeedbackDto } from '../orders/dto/order.dto';

@Controller('admin/delivery-companies')
@UseGuards(JwtSuperUserGuard, StaffGuard)
export class AdminDeliveryCompanyController {
  constructor(private readonly service: DeliveryCompanyService) {}

  @Get()
  list() {
    return this.service.listCompanies();
  }

  @Post()
  create(@Body() dto: CreateDeliveryCompanyDto) {
    return this.service.createCompany(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryCompanyDto) {
    return this.service.updateCompany(id, dto);
  }

  @Post(':id/api-keys')
  createApiKey(@Param('id') id: string, @Body() dto: CreateDeliveryCompanyApiKeyDto) {
    return this.service.createApiKey(id, dto);
  }

  @Post(':id/api-keys/:keyId/revoke')
  revokeApiKey(@Param('id') id: string, @Param('keyId') keyId: string) {
    return this.service.revokeApiKey(id, keyId);
  }
}

@Controller('v1/company')
@UseGuards(DeliveryCompanyApiKeyGuard)
export class DeliveryCompanyController {
  constructor(private readonly service: DeliveryCompanyService) {}

  @Get('profile')
  profile(@Req() req: any) {
    return this.service.getCompanyProfile(req.deliveryCompany.id);
  }

  @Post('departments')
  addDepartment(@Req() req: any, @Body() dto: CreateDeliveryCompanyAddressDto) {
    return this.service.createCompanyAddress(req.deliveryCompany.id, dto);
  }

  @Get('orders')
  orders(@Req() req: any) {
    return this.service.listCompanyOrders(req.deliveryCompany.id);
  }

  @Post('orders/:id/return-deposit-feedback')
  submitReturnDepositFeedback(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReturnDepositFeedbackDto,
  ) {
    return this.service.submitReturnDepositFeedback(
      req.deliveryCompany.id,
      id,
      dto.feedback,
      !!dto.conditionIssue,
    );
  }

  @Post('orders/preview')
  preview(@Req() req: any, @Body() dto: CreateDeliveryCompanyOrderDto) {
    return this.service.previewOrder(req.deliveryCompany.id, dto);
  }

  @Post('orders')
  createOrder(@Req() req: any, @Body() dto: CreateDeliveryCompanyOrderDto) {
    return this.service.createOrder(req.deliveryCompany.id, dto);
  }

  @Get('wallet')
  wallet(@Req() req: any) {
    return this.service.getWallet(req.deliveryCompany.id);
  }

  @Get('wallet/transactions')
  walletTransactions(@Req() req: any) {
    return this.service.getWalletTransactions(req.deliveryCompany.id);
  }

  @Post('refund-requests')
  createRefund(@Req() req: any, @Body() dto: CreateDeliveryCompanyRefundRequestDto) {
    return this.service.createRefundRequest(req.deliveryCompany.id, dto);
  }

  @Get('refund-requests')
  listRefunds(@Req() req: any) {
    return this.service.listRefundRequests(req.deliveryCompany.id);
  }

  @Get('stats')
  stats(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getStats(req.deliveryCompany.id, from, to);
  }
}
