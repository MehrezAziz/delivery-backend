import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class ReferralCodeNotYetValidException extends ReferralException {
  constructor() {
    super(
      'Referral code is not yet valid',
      'REFERRAL_CODE_NOT_YET_VALID',
      HttpStatus.BAD_REQUEST
    );
  }
}
