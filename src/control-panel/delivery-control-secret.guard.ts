import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DeliveryControlSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('DELIVERY_CONTROL_NOTIFY_SECRET');
    if (!secret) return false;
    const req = context.switchToHttp().getRequest();
    const header = req.headers['x-delivery-control-secret'];
    return typeof header === 'string' && header === secret;
  }
}
