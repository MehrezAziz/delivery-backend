import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Public terms for in-app / WebView (customer registration link). */
  @Get('terms')
  getTerms() {
    return {
      title: 'Application terms',
      summary:
        'By using this service you agree to the rules below. Violations may be handled through legal channels where applicable.',
      rules: [
        'Do not send: sensitive administrative documents, cash or money transfers as delivery content, prohibited substances, or high-value precious items without explicit platform approval.',
        'Do not deceive app administrators or falsely accuse drivers or customers. Investigations may involve support staff and may lead to suspension or legal follow-up.',
        'Drivers and customers are expected to treat each other respectfully. Report serious issues through support so customer service can review them.',
      ],
      lastUpdated: '2026-04-13',
    };
  }
}
