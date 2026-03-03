import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class ReferralCodeExpiredException extends ReferralException {
  constructor() {
    super(
      'Referral code has expired',
      'REFERRAL_CODE_EXPIRED',
      HttpStatus.BAD_REQUEST
    );
  }
}
