export class RegisterDriverStep2ResponseDto {
  /** Real access token — user+driver+address now exist in DB */
  accessToken: string;
  driver: {
    id: string;
    userId: string;
    vehicleType: string;
    description?: string;
    status: 'INCOMPLETE';
  };
  nextStep: 'step3';
}
