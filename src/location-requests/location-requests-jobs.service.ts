import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LocationRequestsService } from './location-requests.service';

@Injectable()
export class LocationRequestsJobsService {
  private readonly logger = new Logger(LocationRequestsJobsService.name);

  constructor(private readonly locationRequests: LocationRequestsService) {}

  @Cron('0 */15 * * * *')
  async expireStaleRequests(): Promise<void> {
    try {
      const count = await this.locationRequests.expireStaleRequests();
      if (count > 0) {
        this.logger.log(`Expired ${count} location share request(s).`);
      }
    } catch (e) {
      this.logger.error(`expireStaleRequests: ${(e as Error).message}`);
    }
  }
}
