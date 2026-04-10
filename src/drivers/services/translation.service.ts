import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DocumentTranslationPayload, TranslationFieldBundle } from './document-translation.types';

const FIELDS: (keyof TranslationFieldBundle)[] = ['firstName', 'lastName', 'idNumber', 'dateOfBirth'];

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('TRANSLATION_ENABLED') === 'true';
  }

  getTargetLocale(): string {
    return (this.config.get<string>('TRANSLATION_TARGET_LOCALE') || 'en').trim() || 'en';
  }

  private getApiKey(): string | undefined {
    const k = this.config.get<string>('GOOGLE_TRANSLATE_API_KEY');
    return k?.trim() || undefined;
  }

  /**
   * Batch-translate non-empty strings to `targetLocale` via Google Cloud Translation API v2.
   */
  async translateFields(
    declared: TranslationFieldBundle,
    extracted: TranslationFieldBundle,
    targetLocale: string,
  ): Promise<DocumentTranslationPayload> {
    const originalDeclared: TranslationFieldBundle = { ...declared };
    const originalExtracted: TranslationFieldBundle = { ...extracted };

    const keys: string[] = [];
    const q: string[] = [];

    for (const f of FIELDS) {
      const v = declared[f]?.trim();
      if (v) {
        keys.push(`d:${f}`);
        q.push(v);
      }
    }
    for (const f of FIELDS) {
      const v = extracted[f]?.trim();
      if (v) {
        keys.push(`e:${f}`);
        q.push(v);
      }
    }

    const translatedDeclared: TranslationFieldBundle = {};
    const translatedExtracted: TranslationFieldBundle = {};
    const base: Omit<DocumentTranslationPayload, 'error'> = {
      targetLocale,
      provider: 'google-translate-v2',
      translatedAt: new Date().toISOString(),
      originalDeclared,
      originalExtracted,
      translatedDeclared,
      translatedExtracted,
    };

    if (q.length === 0) {
      return { ...base, translatedDeclared: {}, translatedExtracted: {} };
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        ...base,
        error: 'GOOGLE_TRANSLATE_API_KEY is not configured',
      };
    }

    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, target: targetLocale, format: 'text' }),
      });
      const json = (await res.json()) as {
        data?: { translations?: { translatedText?: string }[] };
        error?: { message?: string };
      };

      if (!res.ok) {
        const msg = json.error?.message || res.statusText;
        throw new Error(msg);
      }

      const translations = json.data?.translations ?? [];
      if (translations.length !== q.length) {
        throw new Error('Unexpected translation response length');
      }

      for (let i = 0; i < keys.length; i++) {
        const [side, field] = keys[i].split(':') as ['d' | 'e', keyof TranslationFieldBundle];
        const text = translations[i]?.translatedText ?? '';
        if (side === 'd') {
          translatedDeclared[field] = text;
        } else {
          translatedExtracted[field] = text;
        }
      }

      return { ...base, translatedDeclared, translatedExtracted };
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`Google Translate failed: ${message}`);
      return {
        ...base,
        translatedDeclared: {},
        translatedExtracted: {},
        error: message,
      };
    }
  }
}
