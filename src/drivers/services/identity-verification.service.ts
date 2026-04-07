import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateLivenessChallengeDto,
  VerifyDocumentSubmissionDto,
} from '../dto/verification-analysis.dto';
import { VerificationRulesService } from './verification-rules.service';
import { LivenessChallengeService } from './liveness-challenge.service';

@Injectable()
export class IdentityVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: VerificationRulesService,
    private readonly liveness: LivenessChallengeService,
  ) {}

  async createLivenessChallenge(
    userId: string,
    documentId: string,
    dto: CreateLivenessChallengeDto,
  ) {
    await this.assertDocumentBelongsToDriver(userId, documentId);
    const challenge = await this.liveness.createChallenge(documentId, dto.level ?? 'LOW');
    return {
      challengeId: challenge.id,
      documentId: challenge.documentId,
      actions: challenge.actions,
      expiresAt: challenge.expiresAt,
    };
  }

  async verifySubmission(
    userId: string,
    documentId: string,
    challengeId: string,
    dto: VerifyDocumentSubmissionDto,
  ) {
    if (!challengeId) {
      throw new BadRequestException('challengeId query parameter is required');
    }
    const document = await this.assertDocumentBelongsToDriver(userId, documentId);
    const challenge = await this.liveness.getChallenge(challengeId);
    if (challenge.documentId !== documentId) {
      throw new BadRequestException('Challenge does not belong to this document');
    }

    const providedActions = new Set((dto.liveness.steps ?? []).map((s) => s.action));
    const missingActions = challenge.actions.filter((action) => !providedActions.has(action));
    if (missingActions.length > 0) {
      throw new BadRequestException(
        `Missing required liveness actions: ${missingActions.join(', ')}`,
      );
    }

    const text = this.rules.scoreTextConsistency(dto.declared, dto.ocr);
    const recommendation = this.rules.decideVerification({
      textScore: text.score,
      faceSimilarity: dto.face.similarity,
      livenessPassed: dto.liveness.passed,
    });

    const analysisPayload = {
      pipeline: 'rules-v1',
      textScore: text.score,
      faceSimilarity: dto.face.similarity,
      livenessPassed: dto.liveness.passed,
      livenessConfidence: dto.liveness.confidence ?? null,
      recommendation: recommendation.decision,
      reasons: recommendation.reasons,
      thresholds: recommendation.thresholds,
      fields: text.fields,
      challenge: {
        id: challenge.id,
        actions: challenge.actions,
      },
      rawEngineOutput: dto.rawEngineOutput ?? null,
      analyzedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        firstName: dto.ocr.firstName ?? document.firstName,
        lastName: dto.ocr.lastName ?? document.lastName,
        idNumber: dto.ocr.idNumber ?? document.idNumber,
        mlAnalysis: analysisPayload as unknown as Prisma.InputJsonValue,
        selfieVerified: dto.liveness.passed && dto.face.similarity >= recommendation.thresholds.face,
        verificationStatus: VerificationStatus.SUBMITTED,
      },
      select: {
        id: true,
      },
    });

    await this.liveness.consumeChallenge(challengeId);

    return {
      documentId: document.id,
      recommendation: recommendation.decision,
      reasons: recommendation.reasons,
      textScore: text.score,
      faceSimilarity: dto.face.similarity,
      livenessPassed: dto.liveness.passed,
      message:
        'Automated analysis stored for staff review. Final approval is done by admin/customer service.',
    };
  }

  private async assertDocumentBelongsToDriver(userId: string, documentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driver: true },
    });
    if (!user?.driver) {
      throw new ForbiddenException('Only drivers can run verification');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        verification: true,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.verification.driverId !== user.driver.id) {
      throw new ForbiddenException('This document does not belong to the authenticated driver');
    }
    return document;
  }
}
