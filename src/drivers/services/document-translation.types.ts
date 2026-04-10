/** Subset of identity fields translated for staff review + scoring. */
export type TranslationFieldBundle = {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  dateOfBirth?: string;
};

/** Persisted on `Document.translationData`. */
export type DocumentTranslationPayload = {
  targetLocale: string;
  provider: 'google-translate-v2';
  translatedAt: string;
  originalDeclared: TranslationFieldBundle;
  originalExtracted: TranslationFieldBundle;
  translatedDeclared: TranslationFieldBundle;
  translatedExtracted: TranslationFieldBundle;
  error?: string;
};
