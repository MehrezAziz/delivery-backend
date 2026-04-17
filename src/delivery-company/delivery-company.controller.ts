import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { JwtSuperUserGuard, StaffGuard } from '../auth/guards/auth.guards';
import { DeliveryCompanyApiKeyGuard } from './delivery-company-auth.guard';
import { DeliveryCompanyService } from './delivery-company.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateDeliveryCompanyAddressDto,
  CreateDeliveryCompanyApiKeyDto,
  CreateDeliveryCompanyDto,
  CreateDeliveryCompanyOrderDto,
  CreateDeliveryCompanyRefundRequestDto,
  UpdateDeliveryCompanyDto,
} from './dto/delivery-company.dto';
import { ReturnDepositFeedbackDto } from '../orders/dto/order.dto';
import { NotificationPriority, NotificationType } from '@prisma/client';

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
  constructor(
    private readonly service: DeliveryCompanyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private actorRole(req: any): string {
    const raw = req?.headers?.['x-company-actor-role'];
    if (!raw) {
      throw new ForbiddenException('Missing x-company-actor-role header');
    }
    return String(raw).toUpperCase();
  }

  private departmentId(req: any): string | undefined {
    const v = req?.headers?.['x-company-department-id'];
    if (!v) return undefined;
    const s = String(v).trim();
    return s ? s : undefined;
  }

  private requireActorRole(actorRole: string, allowed: string[]) {
    if (!allowed.includes(actorRole)) {
      throw new ForbiddenException('Actor role is not allowed for this action');
    }
  }

  private async requireDepartmentContext(companyId: string, actorRole: string, departmentId?: string) {
    if (actorRole === 'MAIN_ADMIN') return;
    if (!departmentId) throw new ForbiddenException('Department context is missing');
    await this.service.ensureDepartmentBelongsToCompany(companyId, departmentId);
  }

  @Post('notifications/department')
  async dispatchDepartmentNotification(@Req() req: any, @Body() body: any) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);

    await this.service.ensureDepartmentBelongsToCompany(companyId, departmentId);
    if (!departmentId) throw new BadRequestException('Department context is missing');

    const type = body?.type as string;
    // `NotificationType` is a Prisma enum; cast to string[] so `.has(type)` accepts a plain string.
    const allowedTypes = new Set(Object.values(NotificationType) as string[]);
    if (!type || !allowedTypes.has(type)) {
      throw new BadRequestException('Invalid notification type');
    }

    return this.notificationsService.send({
      userId: departmentId,
      userType: 'USER',
      type: type as any,
      title: body?.title ?? 'Delivery company update',
      body: body?.body ?? '',
      priority: body?.priority as NotificationPriority | undefined,
      relatedEntityType: body?.relatedEntityType,
      relatedEntityId: body?.relatedEntityId,
      groupKey: body?.groupKey,
      actionButtons: body?.actionButtons,
    } as any);
  }

  @Get('profile')
  profile(@Req() req: any) {
    return this.service.getCompanyProfile(req.deliveryCompany.id);
  }

  @Post('departments')
  addDepartment(@Req() req: any, @Body() dto: CreateDeliveryCompanyAddressDto) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN']);
    return this.service.createCompanyAddress(req.deliveryCompany.id, dto);
  }

  @Get('orders')
  async orders(@Req() req: any) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.listCompanyOrders(companyId, deptIdForScope);
  }

  @Post('orders/:id/return-deposit-feedback')
  async submitReturnDepositFeedback(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReturnDepositFeedbackDto,
  ) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    if (!departmentId) throw new BadRequestException('Department context is missing');
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    await this.service.ensureDepartmentBelongsToCompany(companyId, departmentId);

    const idemKeyHeader =
      (req?.headers?.['idempotency-key'] as string | undefined) ||
      (req?.headers?.['Idempotency-Key'] as string | undefined);
    if (!idemKeyHeader) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({ feedback: dto.feedback, conditionIssue: !!dto.conditionIssue }) +
          '|' +
          String(companyId) +
          '|' +
          String(id) +
          '|' +
          String(departmentId ?? ''),
      )
      .digest('hex');

    return this.service.submitReturnDepositFeedback(
      companyId,
      id,
      dto.feedback,
      !!dto.conditionIssue,
      departmentId,
      idemKeyHeader,
      requestHash,
    );
  }

  @Post('orders/preview')
  async preview(@Req() req: any, @Body() dto: CreateDeliveryCompanyOrderDto) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentIdHeader = this.departmentId(req);
    const resolvedDepartmentId =
      actorRole === 'MAIN_ADMIN' ? departmentIdHeader || dto.pickupAddressId : departmentIdHeader;
    await this.requireDepartmentContext(companyId, actorRole, resolvedDepartmentId);
    await this.service.ensureDepartmentBelongsToCompany(companyId, resolvedDepartmentId);
    return this.service.previewOrder(companyId, dto, resolvedDepartmentId);
  }

  @Post('orders')
  async createOrder(@Req() req: any, @Body() dto: CreateDeliveryCompanyOrderDto) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentIdHeader = this.departmentId(req);
    const resolvedDepartmentId =
      actorRole === 'MAIN_ADMIN' ? departmentIdHeader || dto.pickupAddressId : departmentIdHeader;
    await this.requireDepartmentContext(companyId, actorRole, resolvedDepartmentId);
    await this.service.ensureDepartmentBelongsToCompany(companyId, resolvedDepartmentId);

    const idemKeyHeader =
      (req?.headers?.['idempotency-key'] as string | undefined) ||
      (req?.headers?.['Idempotency-Key'] as string | undefined);
    if (!idemKeyHeader) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify(dto) + '|' + String(companyId) + '|' + String(resolvedDepartmentId ?? ''))
      .digest('hex');
    const idempotencyKey = idemKeyHeader;

    return this.service.createOrder(companyId, dto, resolvedDepartmentId, idempotencyKey, requestHash);
  }

  @Post('orders/:id/add-confirmation-delay')
  async addConfirmationDelay(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { minutesToAdd?: number },
  ) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.addOrderConfirmationDelayMinutes(
      companyId,
      id,
      Number(body?.minutesToAdd ?? 0),
      deptIdForScope,
    );
  }

  @Post('orders/:id/approve-driver')
  async approveDriver(@Req() req: any, @Param('id') id: string) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.approveOrderDriver(companyId, id, deptIdForScope);
  }

  @Post('orders/:id/reject-driver')
  async rejectDriver(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.rejectOrderDriver(companyId, id, body?.reason, deptIdForScope);
  }

  @Get('orders/:id/chat')
  async getOrderChat(@Req() req: any, @Param('id') id: string) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.getOrderChat(companyId, id, deptIdForScope);
  }

  @Post('orders/:id/chat/messages')
  async sendOrderChatMessage(@Req() req: any, @Param('id') id: string, @Body() body: { content?: string }) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.sendOrderChatMessage(companyId, id, String(body?.content ?? ''), deptIdForScope);
  }

  @Get('wallet')
  async wallet(@Req() req: any) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.getWallet(companyId, deptIdForScope);
  }

  @Get('wallet/transactions')
  async walletTransactions(@Req() req: any) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.getWalletTransactions(companyId, deptIdForScope);
  }

  @Post('refund-requests')
  async createRefund(@Req() req: any, @Body() dto: CreateDeliveryCompanyRefundRequestDto) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN']);
    const companyId = req.deliveryCompany.id;
    const idemKeyHeader =
      (req?.headers?.['idempotency-key'] as string | undefined) ||
      (req?.headers?.['Idempotency-Key'] as string | undefined);
    if (!idemKeyHeader) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const requestHash = createHash('sha256').update(JSON.stringify(dto) + '|' + String(companyId)).digest('hex');
    const idempotencyKey = idemKeyHeader;
    return this.service.createRefundRequest(companyId, dto, idempotencyKey, requestHash);
  }

  @Get('refund-requests')
  listRefunds(@Req() req: any) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN']);
    return this.service.listRefundRequests(req.deliveryCompany.id);
  }

  @Get('stats')
  async stats(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const actorRole = this.actorRole(req);
    this.requireActorRole(actorRole, ['MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER']);
    const companyId = req.deliveryCompany.id;
    const departmentId = this.departmentId(req);
    await this.requireDepartmentContext(companyId, actorRole, departmentId);
    const deptIdForScope = actorRole === 'MAIN_ADMIN' ? undefined : departmentId;
    return this.service.getStats(companyId, from, to, deptIdForScope);
  }
}
