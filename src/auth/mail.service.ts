import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT') || '587');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!user || !pass) {
      this.logger.warn('SMTP_USER / SMTP_PASS not set — password-reset emails will not be sent.');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      requireTLS: port === 587,
    });
    return this.transporter;
  }

  /**
   * Subject + body contain only the code (plain). HTML adds layout + easy select/copy hint for clients that support it.
   */
  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    const from =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@localhost';

    const subject = code;
    const textBody = code;

    const htmlBody = `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:ui-monospace,Menlo,monospace;">
<div style="-webkit-user-select:all;-moz-user-select:all;user-select:all;font-size:28px;letter-spacing:8px;text-align:center;">${code}</div>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr><td style="background:#2563eb;border-radius:8px;padding:10px 22px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;color:#ffffff;">Copy</td></tr></table>
</body></html>`;

    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn(`[SMTP disabled] Password reset code for ${to}: ${code}`);
      return;
    }

    try {
      await transport.sendMail({
        from,
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (err: unknown) {
      const nodemailerErr = err as { code?: string; responseCode?: number; message?: string };
      this.logger.error(
        `SMTP send failed (${nodemailerErr.code ?? 'UNKNOWN'}): ${nodemailerErr.message ?? err}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (nodemailerErr.code === 'EAUTH' || nodemailerErr.responseCode === 535) {
        this.logger.warn(
          'Gmail rejected SMTP credentials. Use an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal Gmail password. SMTP_USER must match the Gmail address.',
        );
      }
      throw new ServiceUnavailableException(
        "We couldn't send the verification email. Try SMS or WhatsApp instead, or try again later. If you manage this server, fix Gmail SMTP: enable 2-Step Verification and set SMTP_PASS to a 16-character App Password.",
      );
    }
  }
}
