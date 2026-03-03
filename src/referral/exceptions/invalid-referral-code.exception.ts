import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class InvalidReferralCodeException extends ReferralException {
  constructor(reason?: string) {
    super(
      reason || 'Invalid referral code',
      'INVALID_REFERRAL_CODE',
      HttpStatus.BAD_REQUEST
    );
  }
}
