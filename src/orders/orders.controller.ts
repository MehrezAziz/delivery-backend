import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import { CreateOrderDto, PreviewOrderDto, CancelOrderDto, ChangePaymentMethodDto, UpdateOrderStatusDto, SendChatMessageDto, CreateDisputeDto, RequestAssistanceDto } from './dto/order.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerGuard, DriverGuard, UserActiveGuard, UserRestrictionGuard, VerifiedDriverGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';
import { OrderStatus } from '@prisma/client';

// ============================================
// CUSTOMER ORDER ENDPOINTS
// ============================================
@Controller('orders')
@UseGuards(JwtUserGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly driverAssignmentService: DriverAssignmentService,
  ) {}

  @Post()
  @UseGuards(CustomerGuard, UserActiveGuard, UserRestrictionGuard)
  async createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Post('preview')
  @UseGuards(CustomerGuard)
  async previewOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewOrderDto) {
    return this.ordersService.previewOrder(user.id, dto);
  }

  @Get('my-orders')
  @UseGuards(CustomerGuard)
  async getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getCustomerOrders(user.id);
  }

  @Get(':id')
  async getOrderById(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    return this.ordersService.getOrderById(orderId, user.id);
  }

  @Patch(':id/payment-method')
  @UseGuards(CustomerGuard)
  async changePaymentMethod(
    @CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: ChangePaymentMethodDto,
  ) {
    return this.ordersService.changePaymentMethod(orderId, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(CustomerGuard)
  async cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: CancelOrderDto) {
    await this.ordersService.cancelOrder(orderId, user.id, dto.reason);
    return { message: 'Order cancelled successfully' };
  }

  @Get(':id/driver-location')
  @UseGuards(CustomerGuard)
  async getDriverLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    return this.ordersService.getDriverLocation(orderId, user.id);
  }

  @Post(':id/dispute')
  @UseGuards(CustomerGuard)
  async createDispute(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: CreateDisputeDto) {
    return this.ordersService.createDispute(orderId, user.id, dto.reason);
  }

  @Post(':id/assistance')
  async requestAssistance(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: RequestAssistanceDto) {
    return this.ordersService.requestAssistance(orderId, user.id, dto.message);
  }

  // Chat endpoints
  @Get(':id/chat')
  async getChatRoom(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    return this.ordersService.getChatRoom(orderId, user.id);
  }

  @Post(':id/chat/messages')
  async sendChatMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: SendChatMessageDto) {
    return this.ordersService.sendChatMessage(orderId, user.id, dto.content, dto.image);
  }
}

// ============================================
// DRIVER ORDER ENDPOINTS
// ============================================
@Controller('driver/orders')
@UseGuards(JwtUserGuard, DriverGuard)
export class DriverOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly driverAssignmentService: DriverAssignmentService,
  ) {}

  @Get('available')
  async getAvailableOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.driverAssignmentService.getAvailableOrdersForDriver(user.profileId);
  }

  @Get('my-orders')
  async getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getDriverOrders(user.profileId);
  }

  @Post(':id/accept')
  @UseGuards(UserActiveGuard, UserRestrictionGuard)
  async acceptOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    await this.driverAssignmentService.acceptOrder(user.profileId, orderId);
    return { message: 'Order accepted successfully' };
  }

  @Patch(':id/status')
  @UseGuards(UserActiveGuard)
  async updateStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatus(orderId, user.profileId, dto.status);
  }

  @Post(':id/cancel-assignment')
  async cancelAssignment(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: CancelOrderDto) {
    return this.driverAssignmentService.cancelAssignment(orderId, user.id, dto.reason);
  }

  @Patch(':id/proofs')
  async uploadProofs(
    @CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string,
    @Body() body: { image1Proof?: string; image2Proof?: string },
  ) {
    return this.ordersService.uploadProofs(orderId, user.profileId, body.image1Proof, body.image2Proof);
  }

  @Post(':id/location')
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string,
    @Body() body: { latitude: number; longitude: number; accuracy?: number },
  ) {
    return this.ordersService.updateDriverLocation(orderId, user.profileId, body.latitude, body.longitude, body.accuracy);
  }

  @Post(':id/assistance')
  async requestAssistance(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: RequestAssistanceDto) {
    return this.ordersService.requestAssistance(orderId, user.id, dto.message);
  }

  @Get(':id/chat')
  async getChatRoom(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    return this.ordersService.getChatRoom(orderId, user.id);
  }

  @Post(':id/chat/messages')
  async sendChatMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string, @Body() dto: SendChatMessageDto) {
    return this.ordersService.sendChatMessage(orderId, user.id, dto.content, dto.image);
  }
}

// ============================================
// ADMIN/CS ORDER ENDPOINTS
// ============================================
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getAllOrders(@Query('status') status?: OrderStatus) {
    return this.ordersService.getAllOrders(status);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    // Admin can view any order - pass a dummy userId that won't match, use direct query
    const order = await this.ordersService.getAllOrders();
    return order.find(o => o.id === id);
  }
}
