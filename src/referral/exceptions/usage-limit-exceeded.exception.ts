import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class UsageLimitExceededException extends ReferralException {
  constructor(message?: string) {
    super(
      message || 'Referral code usage limit exceeded',
      'USAGE_LIMIT_EXCEEDED',
      HttpStatus.BAD_REQUEST
    );
  }
}
