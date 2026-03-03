import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class CannotUseOwnCodeException extends ReferralException {
  constructor() {
    super(
      'Cannot use your own referral code',
      'CANNOT_USE_OWN_CODE',
      HttpStatus.BAD_REQUEST
    );
  }
}
