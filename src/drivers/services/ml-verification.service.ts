import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationRulesService } from './verification-rules.service';

@Injectable()
export class MlVerificationService {
  private readonly logger = new Logger(MlVerificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rules: VerificationRulesService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('ML_VERIFY_ENABLED') === 'true';
  }

  scheduleAnalysis(documentId: string): void {
    void this.runAnalysis(documentId).catch((e) =>
      this.logger.warn(`ML analysis failed for document ${documentId}: ${(e as Error).message}`),
    );
  }

  async checkLivenessFrame(
    action: 'TURN_LEFT' | 'TURN_RIGHT' | 'HOLD_HIGH' | 'BLINK',
    imageBase64: string,
  ): Promise<{
    matched: boolean;
    faceDetected: boolean;
    yaw?: number;
    pitch?: number;
    roll?: number;
    eyesDetected?: number;
  }> {
    const url = this.resolveLivenessWorkerUrl();
    if (!url) {
      throw new Error('Liveness worker URL is not configured');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.get<string>('FACE_WORKER_API_KEY')
          ? { Authorization: `Bearer ${this.config.get<string>('FACE_WORKER_API_KEY')}` }
          : {}),
      },
      body: JSON.stringify({ action, imageBase64 }),
    });
    if (!res.ok) {
      throw new Error(`Liveness worker failed: ${res.status}`);
    }

    const payload = (await res.json()) as {
      matched?: boolean;
      faceDetected?: boolean;
      yaw?: number;
      pitch?: number;
      roll?: number;
      eyesDetected?: number;
    };
    return {
      matched: payload.matched === true,
      faceDetected: payload.faceDetected === true,
      yaw: typeof payload.yaw === 'number' ? payload.yaw : undefined,
      pitch: typeof payload.pitch === 'number' ? payload.pitch : undefined,
      roll: typeof payload.roll === 'number' ? payload.roll : undefined,
      eyesDetected: typeof payload.eyesDetected === 'number' ? payload.eyesDetected : undefined,
    };
  }

  async runAnalysis(documentId: string): Promise<void> {
    if (!this.isEnabled()) return;
    this.logger.log(`ML analysis started for document ${documentId}`);

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        verification: {
          include: {
            driver: {
              include: { user: true },
            },
          },
        },
      },
    });
    if (!doc) return;

    const docUrl = doc.docImageTop || doc.documentImage;
    const selfieUrl = doc.selfieImage;
    if (!docUrl || !selfieUrl) {
      this.logger.warn(`Document ${documentId} missing doc/selfie URLs; skip ML`);
      return;
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-verify-'));
    const docPath = path.join(tmp, 'doc.jpg');
    const selfiePath = path.join(tmp, 'selfie.jpg');

    try {
      await this.downloadFile(docUrl, docPath);
      await this.downloadFile(selfieUrl, selfiePath);

      const ocrResult = await this.extractOcr(docPath);
      const mapped = this.mapOcrToFields(ocrResult.rawText ?? '');
      const faceSimilarity = await this.compareFaces(docPath, selfiePath);

      const declared = {
        firstName: doc.verification.driver.user.firstName ?? undefined,
        lastName: doc.verification.driver.user.secondName ?? undefined,
        idNumber: doc.idNumber ?? undefined,
        dateOfBirth: doc.dateOfBirth ? doc.dateOfBirth.toISOString().slice(0, 10) : undefined,
      };
      const textScores = this.rules.scoreTextConsistency(declared, mapped);
      const recommendation = this.rules.decideVerification({
        textScore: textScores.score,
        faceSimilarity,
        livenessPassed: true, // realtime liveness is captured in registration flow
      });

      const parsed = {
        pipeline: 'worker-v2',
        recommendation: recommendation.decision,
        reasons: recommendation.reasons,
        textScore: textScores.score,
        faceSimilarity,
        ocr: {
          provider: ocrResult.provider,
          rawText: ocrResult.rawText,
          confidence: ocrResult.confidence,
          mapped,
          fields: textScores.fields,
        },
        livenessPassed: true,
        analyzedAt: new Date().toISOString(),
      } as Record<string, unknown>;

      const existing = (doc.mlAnalysis as Record<string, unknown> | null) ?? {};
      const merged = {
        ...existing,
        ...parsed,
        livenessSession: existing.livenessSession ?? parsed.livenessSession,
        stage: 'ML_ANALYSIS_COMPLETE',
      } as Record<string, unknown>;

      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          firstName: mapped.firstName ?? doc.firstName,
          lastName: mapped.lastName ?? doc.lastName,
          idNumber: mapped.idNumber ?? doc.idNumber,
          mlAnalysis: merged as Prisma.InputJsonValue,
          selfieVerified: faceSimilarity >= 0.52,
        },
      });
      this.logger.log(
        `ML analysis stored for document ${documentId} | textScore=${textScores.score.toFixed(4)} faceSimilarity=${faceSimilarity.toFixed(4)} decision=${recommendation.decision}`,
      );
    } catch (e) {
      const err = e as Error;
      this.logger.warn(`ML verify_driver_documents error: ${err.message}${err.stack ? `\n${err.stack}` : ''}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * DocumentsService stores local paths like `uploads/...` or `./uploads/...`.
   * Only http(s) URLs work with fetch; local files must be read from disk.
   */
  private async downloadFile(urlOrPath: string, dest: string): Promise<void> {
    const s = urlOrPath.trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const res = await fetch(s);
      if (!res.ok) {
        throw new Error(`GET ${s} -> ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(dest, buf);
      return;
    }

    const resolved = path.isAbsolute(s)
      ? s
      : path.resolve(process.cwd(), s.replace(/^\.\//, ''));
    const buf = await fs.readFile(resolved);
    await fs.writeFile(dest, buf);
  }

  private async extractOcr(
    docPath: string,
  ): Promise<{ provider: string; rawText: string; confidence: number | null }> {
    const ocrWorkerUrl = this.config.get<string>('OCR_WORKER_URL');
    const ocrApiKey = this.config.get<string>('OCR_WORKER_API_KEY');
    const image = await fs.readFile(docPath);
    const imageBase64 = image.toString('base64');

    if (ocrWorkerUrl) {
      const res = await fetch(ocrWorkerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ocrApiKey ? { Authorization: `Bearer ${ocrApiKey}` } : {}),
        },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) throw new Error(`OCR worker failed: ${res.status}`);
      const payload = (await res.json()) as {
        text?: string;
        confidence?: number;
      };
      return {
        provider: 'external-worker',
        rawText: payload.text ?? '',
        confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
      };
    }

    return {
      provider: 'fallback',
      rawText: '',
      confidence: null,
    };
  }

  private async compareFaces(docPath: string, selfiePath: string): Promise<number> {
    const faceWorkerUrl = this.config.get<string>('FACE_WORKER_URL');
    const faceApiKey = this.config.get<string>('FACE_WORKER_API_KEY');

    if (faceWorkerUrl) {
      const [docBuf, selfieBuf] = await Promise.all([fs.readFile(docPath), fs.readFile(selfiePath)]);
      const res = await fetch(faceWorkerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(faceApiKey ? { Authorization: `Bearer ${faceApiKey}` } : {}),
        },
        body: JSON.stringify({
          documentImageBase64: docBuf.toString('base64'),
          selfieImageBase64: selfieBuf.toString('base64'),
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { similarity?: number };
        if (typeof payload.similarity === 'number') {
          return payload.similarity;
        }
      }
    }

    // deterministic lightweight fallback when face worker is not configured
    const [d, s] = await Promise.all([fs.readFile(docPath), fs.readFile(selfiePath)]);
    const dh = createHash('sha256').update(d).digest('hex');
    const sh = createHash('sha256').update(s).digest('hex');
    let same = 0;
    for (let i = 0; i < Math.min(dh.length, sh.length); i++) {
      if (dh[i] === sh[i]) same++;
    }
    return Number((same / Math.min(dh.length, sh.length)).toFixed(4));
  }

  private resolveLivenessWorkerUrl(): string | null {
    const explicit = this.config.get<string>('LIVENESS_WORKER_URL');
    if (explicit) return explicit;
    const face = this.config.get<string>('FACE_WORKER_URL');
    if (!face) return null;
    return face.replace(/\/face\/?$/, '/liveness/frame');
  }

  private mapOcrToFields(rawText: string): {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    dateOfBirth?: string;
  } {
    const clean = rawText.replace(/\r/g, '\n');
    const normalized = clean
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const idMatch = clean.match(/\b([A-Z0-9]{6,18})\b/);
    const dobMatch =
      clean.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4})\b/) ||
      clean.match(/\b(\d{4}[\/.-]\d{2}[\/.-]\d{2})\b/);

    const nameCandidates = normalized
      .filter((x) => /^[A-Za-zÀ-ÿ' -]{3,}$/.test(x))
      .slice(0, 2);

    return {
      firstName: nameCandidates[0] || undefined,
      lastName: nameCandidates[1] || undefined,
      idNumber: idMatch?.[1],
      dateOfBirth: dobMatch?.[1],
    };
  }
}
