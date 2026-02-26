import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { DriverAssignmentService } from './services/driver-assignment.service';
import type { CreateOrderDto, CancelOrderDto } from './dto/order.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerGuard, DriverGuard, UserActiveGuard, UserRestrictionGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('orders')
@UseGuards(JwtUserGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly driverAssignmentService: DriverAssignmentService,
  ) {}

  /**
   * Create a new order (Customer only)
   */
  @Post()
  @UseGuards(CustomerGuard, UserActiveGuard, UserRestrictionGuard)
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.id, dto);
  }

  /**
   * Get customer's orders
   */
  @Get('my-orders')
  @UseGuards(CustomerGuard)
  async getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getCustomerOrders(user.id);
  }

  /**
   * Get order by ID
   */
  @Get(':id')
  async getOrderById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderById(orderId, user.id);
  }

  /**
   * Cancel order (Customer only, before driver assignment)
   */
  @Delete(':id')
  @UseGuards(CustomerGuard)
  async cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    await this.ordersService.cancelOrder(orderId, user.id, dto.reason);
    return { message: 'Order cancelled successfully' };
  }
}

@Controller('driver/orders')
@UseGuards(JwtUserGuard, DriverGuard)
export class DriverOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly driverAssignmentService: DriverAssignmentService,
  ) {}

  /**
   * Get available orders for driver (prioritized by zone type)
   */
  @Get('available')
  async getAvailableOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.driverAssignmentService.getAvailableOrdersForDriver(user.profileId);
  }

  /**
   * Get driver's assigned orders
   */
  @Get('my-orders')
  async getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getDriverOrders(user.profileId);
  }

  /**
   * Accept an order
   */
  @Post(':id/accept')
  @UseGuards(UserActiveGuard, UserRestrictionGuard)
  async acceptOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    await this.driverAssignmentService.acceptOrder(user.profileId, orderId);
    return { message: 'Order accepted successfully' };
  }

  /**
   * Cancel order assignment (driver or customer can cancel)
   */
  @Post(':id/cancel-assignment')
  async cancelAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.driverAssignmentService.cancelAssignment(orderId, user.id, dto.reason);
  }
}
