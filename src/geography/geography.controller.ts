import { Controller, Get, Param, Query } from '@nestjs/common';
import { GeographyService } from './geography.service';

@Controller('geography')
export class GeographyController {
  constructor(private readonly geographyService: GeographyService) {}

  /** GET /geography/countries */
  @Get('countries')
  getCountries() {
    return this.geographyService.getCountries();
  }

  /** GET /geography/countries/:id/governorates */
  @Get('countries/:id/governorates')
  getGovernorates(@Param('id') countryId: string) {
    return this.geographyService.getGovernorates(countryId);
  }

  /** GET /geography/governorates/:id/delegations */
  @Get('governorates/:id/delegations')
  getDelegations(@Param('id') governorateId: string) {
    return this.geographyService.getDelegations(governorateId);
  }

  /** GET /geography/delegations/by-coordinates?lat=X&lng=Y — find nearest delegation */
  @Get('delegations/by-coordinates')
  getDelegationByCoordinates(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.geographyService.getDelegationByCoordinates(
      parseFloat(lat),
      parseFloat(lng),
    );
  }
}

