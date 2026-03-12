import { UserGender } from '@prisma/client';

export class RegisterDriverStep1ResponseDto {
  accessToken: string;
  user: {
    id: string;
    phone: string;
    firstName?: string;
    secondName?: string;
    image?: string;
    myEmail?: string;
    userGender?: UserGender;
    role: 'DRIVER';
    createdAt: Date;
  };
  driver: {
    id: string;
    userId: string;
    status: 'INCOMPLETE';
  };
  nextStep: 'step2';
}
