import { UserGender } from '@prisma/client';

export class RegisterDriverStep1ResponseDto {
  /** Short-lived pending token — no DB record created yet */
  pendingToken: string;
  preview: {
    firstName?: string;
    secondName?: string;
    image?: string;
    myEmail?: string;
    userGender?: UserGender;
  };
  nextStep: 'step2';
}
