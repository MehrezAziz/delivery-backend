import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Global pipe that sanitizes all string inputs by stripping dangerous HTML tags.
 * Prevents stored XSS attacks in chat messages, descriptions, and other free-text fields.
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  // Tags that could execute scripts or load external content
  private static readonly DANGEROUS_PATTERN = /<\s*\/?\s*(script|iframe|object|embed|form|input|link|meta|style|svg|math|base|applet)[^>]*>/gi;
  // Event handlers like onclick, onerror, onload, etc.
  private static readonly EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*["'][^"']*["']/gi;
  // javascript: protocol in href/src
  private static readonly JS_PROTOCOL_PATTERN = /javascript\s*:/gi;

  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type === 'body') {
      return this.sanitizeValue(value);
    }
    return value;
  }

  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }
    if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const key of Object.keys(value)) {
        sanitized[key] = this.sanitizeValue(value[key]);
      }
      return sanitized;
    }
    return value;
  }

  private sanitizeString(input: string): string {
    return input
      .replace(SanitizePipe.DANGEROUS_PATTERN, '')
      .replace(SanitizePipe.EVENT_HANDLER_PATTERN, '')
      .replace(SanitizePipe.JS_PROTOCOL_PATTERN, '')
      .trim();
  }
}
