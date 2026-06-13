import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LocationShareRequest,
  LocationShareSlot,
  LocationShareStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeographyService } from '../geography/geography.service';
import { AddressService } from '../users/services/address.service';
import { AcceptLocationRequestDto, CreateLocationRequestDto, LookupRecipientQueryDto } from './dto/location-request.dto';

const EXPIRY_MS = 24 * 60 * 60 * 1000;

type UserIdentity = {
  id: string;
  phone: string | null;
  firstName: string | null;
  secondName: string | null;
  fcmToken: string | null;
};

@Injectable()
export class LocationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly geography: GeographyService,
    private readonly addressService: AddressService,
  ) {}

  normalizePhone(raw: string | undefined | null): string {
    if (raw == null) return '';
    return String(raw).trim().replace(/[\s\-\u00A0]/g, '');
  }

  formatDisplayName(user: Pick<UserIdentity, 'firstName' | 'secondName'>): string {
    const first = (user.firstName || '').trim();
    const second = (user.secondName || '').trim();
    if (first && second) return `${first} ${second.charAt(0).toUpperCase()}.`;
    if (first) return first;
    if (second) return second;
    return 'User';
  }

  formatFullName(user: Pick<UserIdentity, 'firstName' | 'secondName'>): string {
    const parts = [(user.firstName || '').trim(), (user.secondName || '').trim()].filter(Boolean);
    return parts.length ? parts.join(' ') : 'User';
  }

  maskPhone(phone: string | null | undefined): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return phone;
    const last3 = digits.slice(-3);
    const prefix = phone.startsWith('+') ? phone.slice(0, 4) : phone.slice(0, 3);
    return `${prefix} ** *** ${last3}`;
  }

  async resolveRecipientUserIdOrThrow(
    senderUserId: string,
    dto: { recipientUserId?: string; recipientPhone?: string },
  ): Promise<string> {
    const id = (dto.recipientUserId ?? '').trim();
    const phoneNorm = this.normalizePhone(dto.recipientPhone);
    if (id && phoneNorm) {
      throw new BadRequestException('Provide either recipient user ID or phone number, not both.');
    }
    if (!id && !phoneNorm) {
      throw new BadRequestException(
        'Provide recipient user ID or phone number in international format (e.g. +21655664488).',
      );
    }
    if (id) {
      if (id === senderUserId) throw new BadRequestException('You cannot request your own location.');
      const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw new NotFoundException('No account found for this user ID.');
      return id;
    }
    if (!/^\+\d{10,15}$/.test(phoneNorm)) {
      throw new BadRequestException('Phone must be E.164 with country code (e.g. +21655664488).');
    }
    const recipient = await this.prisma.user.findFirst({
      where: { phone: phoneNorm },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('No account found for this phone number.');
    if (recipient.id === senderUserId) throw new BadRequestException('You cannot request your own location.');
    return recipient.id;
  }

  async lookupRecipient(requesterId: string, query: LookupRecipientQueryDto) {
    const targetUserId = await this.resolveRecipientUserIdOrThrow(requesterId, query);
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, phone: true, firstName: true, secondName: true },
    });
    if (!user) throw new NotFoundException('No account found.');
    return {
      userId: user.id,
      displayName: this.formatDisplayName(user),
      phoneMasked: this.maskPhone(user.phone),
    };
  }

  private async getUserOrThrow(userId: string): Promise<UserIdentity> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, firstName: true, secondName: true, fcmToken: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private assertNotExpired(request: LocationShareRequest) {
    if (request.status === LocationShareStatus.EXPIRED || request.expiresAt < new Date()) {
      throw new BadRequestException('This location request has expired.');
    }
  }

  private   mapRequester(user: UserIdentity) {
    return {
      id: user.id,
      firstName: user.firstName,
      secondName: user.secondName,
      displayName: this.formatFullName(user),
      phone: user.phone,
    };
  }

  private mapTarget(user: UserIdentity) {
    return {
      id: user.id,
      displayName: this.formatDisplayName(user),
      phoneMasked: this.maskPhone(user.phone),
    };
  }

  private mapAddress(resultAddress: Awaited<ReturnType<LocationRequestsService['loadResultAddress']>>) {
    if (!resultAddress) return null;
    return {
      id: resultAddress.id,
      latitude: resultAddress.latitude,
      longitude: resultAddress.longitude,
      street: resultAddress.street,
      delegationName: resultAddress.delegation.nameDelegation,
      governorateName: resultAddress.delegation.governorate.nameGovernorate,
    };
  }

  private async loadResultAddress(addressId: string | null) {
    if (!addressId) return null;
    return this.prisma.address.findUnique({
      where: { id: addressId },
      include: {
        delegation: { include: { governorate: true } },
      },
    });
  }

  async toResponse(request: LocationShareRequest) {
    const [requester, target, resultAddress] = await Promise.all([
      this.getUserOrThrow(request.requesterId),
      this.getUserOrThrow(request.targetUserId),
      this.loadResultAddress(request.resultAddressId),
    ]);
    return {
      id: request.id,
      slot: request.slot,
      status: request.status,
      clientRequestId: request.clientRequestId,
      requester: this.mapRequester(requester),
      target: this.mapTarget(target),
      address: this.mapAddress(resultAddress),
      resultLat: request.resultLat,
      resultLng: request.resultLng,
      acceptedAt: request.acceptedAt?.toISOString() ?? null,
      declinedAt: request.declinedAt?.toISOString() ?? null,
      expiresAt: request.expiresAt.toISOString(),
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  async create(requesterId: string, dto: CreateLocationRequestDto) {
    const targetUserId = await this.resolveRecipientUserIdOrThrow(requesterId, dto);
    const [requester, target] = await Promise.all([
      this.getUserOrThrow(requesterId),
      this.getUserOrThrow(targetUserId),
    ]);

    const existing = await this.prisma.locationShareRequest.findFirst({
      where: {
        requesterId,
        targetUserId,
        slot: dto.slot,
        status: LocationShareStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      const response = await this.toResponse(existing);
      return {
        ...response,
        pushWarning: !target.fcmToken ? 'Recipient may not receive a push notification.' : undefined,
        reused: true,
      };
    }

    const expiresAt = new Date(Date.now() + EXPIRY_MS);
    const request = await this.prisma.locationShareRequest.create({
      data: {
        requesterId,
        targetUserId,
        slot: dto.slot,
        status: LocationShareStatus.PENDING,
        clientRequestId: dto.clientRequestId?.trim() || null,
        expiresAt,
      },
    });

    const requesterName = this.formatFullName(requester);
    const slotLabel = dto.slot === LocationShareSlot.PICKUP ? 'pickup' : 'dropoff';

    await this.notifications.send({
      userId: targetUserId,
      userType: 'USER',
      type: NotificationType.LOCATION_SHARE_REQUEST,
      title: `${requesterName} wants to send you a package`,
      body: `Share your exact ${slotLabel} location so they can complete the order.`,
      relatedEntityType: 'LocationShareRequest',
      relatedEntityId: request.id,
      groupKey: `LocationShareRequest:${request.id}`,
      templateData: {
        requesterName,
        requesterPhone: requester.phone || '',
        requesterFirstName: requester.firstName || '',
        requesterSecondName: requester.secondName || '',
        slot: slotLabel,
      },
      actionButtons: [
        { id: 'location_share_accept', title: 'Accept', action: 'foreground' },
        { id: 'location_share_decline', title: 'Reject', action: 'background' },
      ],
    });

    const response = await this.toResponse(request);
    return {
      ...response,
      pushWarning: !target.fcmToken ? 'Recipient may not receive a push notification.' : undefined,
      reused: false,
    };
  }

  async getById(userId: string, id: string) {
    const request = await this.prisma.locationShareRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Location request not found.');
    if (request.requesterId !== userId && request.targetUserId !== userId) {
      throw new ForbiddenException('You do not have access to this location request.');
    }
    return this.toResponse(request);
  }

  async listIncoming(userId: string) {
    const rows = await this.prisma.locationShareRequest.findMany({
      where: {
        targetUserId: userId,
        status: { in: [LocationShareStatus.PENDING, LocationShareStatus.DECLINED] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((r) => this.toResponse(r)));
  }

  async accept(targetUserId: string, id: string, dto: AcceptLocationRequestDto) {
    const request = await this.prisma.locationShareRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Location request not found.');
    if (request.targetUserId !== targetUserId) {
      throw new ForbiddenException('Only the recipient can accept this request.');
    }
    this.assertNotExpired(request);
    if (request.status !== LocationShareStatus.PENDING) {
      throw new BadRequestException('This location request can no longer be accepted.');
    }

    const delegation = await this.geography.getDelegationByCoordinates(dto.latitude, dto.longitude);
    const address = await this.addressService.createAddress(null, {
      latitude: dto.latitude,
      longitude: dto.longitude,
      street: dto.street?.trim() || 'Shared location',
      delegationId: delegation.id,
    });

    const updated = await this.prisma.locationShareRequest.update({
      where: { id },
      data: {
        status: LocationShareStatus.ACCEPTED,
        resultAddressId: address.id,
        resultLat: dto.latitude,
        resultLng: dto.longitude,
        acceptedAt: new Date(),
        declinedAt: null,
      },
    });

    const [requester, target] = await Promise.all([
      this.getUserOrThrow(updated.requesterId),
      this.getUserOrThrow(updated.targetUserId),
    ]);
    const targetName = this.formatDisplayName(target);

    await this.notifications.send({
      userId: updated.requesterId,
      userType: 'USER',
      type: NotificationType.LOCATION_SHARE_FULFILLED,
      relatedEntityType: 'LocationShareRequest',
      relatedEntityId: updated.id,
      templateData: { targetName, slot: updated.slot.toLowerCase() },
    });

    return this.toResponse(updated);
  }

  async decline(targetUserId: string, id: string) {
    const request = await this.prisma.locationShareRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Location request not found.');
    if (request.targetUserId !== targetUserId) {
      throw new ForbiddenException('Only the recipient can decline this request.');
    }
    this.assertNotExpired(request);
    if (
      request.status !== LocationShareStatus.PENDING &&
      request.status !== LocationShareStatus.DECLINED
    ) {
      throw new BadRequestException('This location request can no longer be declined.');
    }
    if (request.status === LocationShareStatus.DECLINED) {
      return this.toResponse(request);
    }

    const updated = await this.prisma.locationShareRequest.update({
      where: { id },
      data: {
        status: LocationShareStatus.DECLINED,
        declinedAt: new Date(),
      },
    });

    const target = await this.getUserOrThrow(targetUserId);
    await this.notifications.send({
      userId: updated.requesterId,
      userType: 'USER',
      type: NotificationType.LOCATION_SHARE_DECLINED,
      relatedEntityType: 'LocationShareRequest',
      relatedEntityId: updated.id,
      templateData: { targetName: this.formatDisplayName(target) },
    });

    return this.toResponse(updated);
  }

  async cancel(requesterId: string, id: string) {
    const request = await this.prisma.locationShareRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Location request not found.');
    if (request.requesterId !== requesterId) {
      throw new ForbiddenException('Only the requester can cancel this request.');
    }
    if (request.status !== LocationShareStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled.');
    }

    const updated = await this.prisma.locationShareRequest.update({
      where: { id },
      data: { status: LocationShareStatus.CANCELLED },
    });
    return this.toResponse(updated);
  }

  async expireStaleRequests(): Promise<number> {
    const result = await this.prisma.locationShareRequest.updateMany({
      where: {
        status: { in: [LocationShareStatus.PENDING, LocationShareStatus.DECLINED] },
        expiresAt: { lt: new Date() },
      },
      data: { status: LocationShareStatus.EXPIRED },
    });
    return result.count;
  }
}
