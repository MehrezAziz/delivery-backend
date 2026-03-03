import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class NoReferralCodeException extends ReferralException {
  constructor() {
    super(
      'Customer does not have a referral code',
      'NO_REFERRAL_CODE',
      HttpStatus.NOT_FOUND
    );
  }
}
