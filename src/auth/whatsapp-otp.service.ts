import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp Cloud API — OTP delivery.
 * Production: create an approved template in Meta Business Suite and set WHATSAPP_OTP_TEMPLATE_NAME (+ language).
 * Cold outreach usually requires a template; plain text may fail outside the 24h window.
 */
@Injectable()
export class WhatsappOtpService {
  private readonly logger = new Logger(WhatsappOtpService.name);

  constructor(private readonly configService: ConfigService) {}

  /** `to` = E.164 without leading + (digits only, country code included). */
  async sendVerificationCode(toDigits: string, code: string): Promise<void> {
    const token = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION') || 'v21.0';
    const templateName = this.configService.get<string>('WHATSAPP_OTP_TEMPLATE_NAME');
    const templateLang = this.configService.get<string>('WHATSAPP_OTP_TEMPLATE_LANG') || 'en';

    const recipient = toDigits.replace(/\D/g, '');
    if (!recipient) {
      throw new Error('Invalid WhatsApp recipient');
    }

    if (!token || !phoneNumberId) {
      this.logger.warn(
        `WhatsApp not configured — code for +${recipient}: ${code}`,
      );
      return;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    let body: Record<string, unknown>;

    if (templateName) {
      body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: code,
        },
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`WhatsApp API error: ${res.status} ${errText}`);
      throw new Error('Failed to send WhatsApp message');
    }

    this.logger.log(`WhatsApp OTP sent to +${recipient}`);
  }
}
