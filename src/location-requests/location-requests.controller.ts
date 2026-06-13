import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LocationRequestsService } from './location-requests.service';
import {
  AcceptLocationRequestDto,
  CreateLocationRequestDto,
  LookupRecipientQueryDto,
} from './dto/location-request.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerOrDriverGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('location-requests')
@UseGuards(JwtUserGuard, CustomerOrDriverGuard)
export class LocationRequestsController {
  constructor(private readonly locationRequests: LocationRequestsService) {}

  @Get('lookup')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  lookup(@CurrentUser() user: AuthenticatedUser, @Query() query: LookupRecipientQueryDto) {
    return this.locationRequests.lookupRecipient(user.id, query);
  }

  @Get('incoming')
  listIncoming(@CurrentUser() user: AuthenticatedUser) {
    return this.locationRequests.listIncoming(user.id);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationRequests.getById(user.id, id);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLocationRequestDto) {
    return this.locationRequests.create(user.id, dto);
  }

  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptLocationRequestDto,
  ) {
    return this.locationRequests.accept(user.id, id, dto);
  }

  @Post(':id/decline')
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationRequests.decline(user.id, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationRequests.cancel(user.id, id);
  }
}
