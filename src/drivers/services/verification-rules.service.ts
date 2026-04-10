import { Injectable } from '@nestjs/common';
import { DeclaredProfileDataDto, OcrExtractedDataDto } from '../dto/verification-analysis.dto';

interface FieldScore {
  field: keyof DeclaredProfileDataDto;
  declared: string | null;
  extracted: string | null;
  score: number;
}

@Injectable()
export class VerificationRulesService {
  private readonly fieldWeights: Record<keyof DeclaredProfileDataDto, number> = {
    firstName: 0.25,
    lastName: 0.25,
    idNumber: 0.35,
    dateOfBirth: 0.15,
  };

  normalizeText(input?: string): string {
    if (!input) return '';
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  scoreStringMatch(a?: string, b?: string): number {
    const left = this.normalizeText(a);
    const right = this.normalizeText(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    return this.jaroWinkler(left, right);
  }

  scoreTextConsistency(declared: DeclaredProfileDataDto, ocr: OcrExtractedDataDto): { score: number; fields: FieldScore[] } {
    let weightedTotal = 0;
    let usedWeight = 0;
    const fields: FieldScore[] = [];

    (Object.keys(this.fieldWeights) as (keyof DeclaredProfileDataDto)[]).forEach((field) => {
      const declaredValue = declared[field] ?? null;
      const extractedValue = ocr[field] ?? null;
      // Only score fields the user actually declared (non-empty).
      if (declaredValue == null || String(declaredValue).trim() === '') {
        return;
      }

      const score = this.scoreStringMatch(declaredValue, extractedValue ?? '');
      const weight = this.fieldWeights[field];
      weightedTotal += score * weight;
      usedWeight += weight;
      fields.push({
        field,
        declared: declaredValue,
        extracted: extractedValue,
        score: Number(score.toFixed(4)),
      });
    });

    if (usedWeight === 0) {
      return { score: 0, fields };
    }

    return {
      score: Number((weightedTotal / usedWeight).toFixed(4)),
      fields,
    };
  }

  decideVerification(input: {
    textScore: number;
    faceSimilarity: number;
    livenessPassed: boolean;
  }): {
    decision: 'APPROVED' | 'REVIEW' | 'REJECTED';
    reasons: string[];
    thresholds: { text: number; face: number };
  } {
    const thresholds = {
      text: 0.78,
      face: 0.52,
    };

    const reasons: string[] = [];

    if (!input.livenessPassed) reasons.push('Liveness challenge failed');
    if (input.textScore < thresholds.text) reasons.push('OCR and declared data mismatch');
    if (input.faceSimilarity < thresholds.face) reasons.push('Face similarity below threshold');

    if (!input.livenessPassed || input.faceSimilarity < 0.38) {
      return { decision: 'REJECTED', reasons, thresholds };
    }

    if (reasons.length > 0) {
      return { decision: 'REVIEW', reasons, thresholds };
    }

    return { decision: 'APPROVED', reasons: ['All checks passed'], thresholds };
  }

  // String similarity helper with lightweight behavior suitable for ID fields.
  private jaroWinkler(a: string, b: string): number {
    if (a === b) return 1;
    const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, b.length);
      for (let j = start; j < end; j++) {
        if (bMatches[j]) continue;
        if (a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const m = matches;
    const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;

    let prefix = 0;
    const maxPrefix = Math.min(4, Math.min(a.length, b.length));
    while (prefix < maxPrefix && a[prefix] === b[prefix]) {
      prefix++;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }
}
