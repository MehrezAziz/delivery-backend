export class RegisterDriverStep2ResponseDto {
  driver: {
    id: string;
    userId: string;
    vehicleType: string;
    description?: string;
    status: 'INCOMPLETE';
  };
  driverLocation: {
    id: string;
    driverId: string;
    latitude: number;
    longitude: number;
  };
  nextStep: 'step3';
}
