import { HttpStatus } from '@nestjs/common';
import { ReferralException } from './referral.exception';

export class CodeGenerationFailedException extends ReferralException {
  constructor() {
    super(
      'Failed to generate unique referral code after maximum attempts',
      'CODE_GENERATION_FAILED',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
