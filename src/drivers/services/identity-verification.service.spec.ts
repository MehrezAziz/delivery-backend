import { BadRequestException } from '@nestjs/common';
import { IdentityVerificationService } from './identity-verification.service';

describe('IdentityVerificationService', () => {
  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    document: { findUnique: jest.fn(), update: jest.fn() },
  };
  const mockRules: any = {
    scoreTextConsistency: jest.fn(),
    decideVerification: jest.fn(),
  };
  const mockLiveness: any = {
    createChallenge: jest.fn(),
    getChallenge: jest.fn(),
    consumeChallenge: jest.fn(),
  };

  let service: IdentityVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IdentityVerificationService(mockPrisma, mockRules, mockLiveness);
  });

  it('throws when challengeId is missing', async () => {
    await expect(
      service.verifySubmission('u1', 'doc1', '', {
        ocr: {},
        declared: {},
        face: { similarity: 0.8 },
        liveness: { passed: true, steps: [] },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('consumes challenge and returns recommendation', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ driver: { id: 'd1' } });
    mockPrisma.document.findUnique.mockResolvedValue({
      id: 'doc1',
      firstName: null,
      lastName: null,
      idNumber: null,
      verification: { driverId: 'd1' },
    });
    mockLiveness.getChallenge.mockResolvedValue({
      id: 'c1',
      documentId: 'doc1',
      actions: ['TURN_LEFT', 'BLINK'],
    });
    mockRules.scoreTextConsistency.mockReturnValue({ score: 0.82, fields: [] });
    mockRules.decideVerification.mockReturnValue({
      decision: 'APPROVED',
      reasons: ['ok'],
      thresholds: { text: 0.78, face: 0.52 },
    });
    mockPrisma.document.update.mockResolvedValue({ id: 'doc1' });

    const out = await service.verifySubmission('u1', 'doc1', 'c1', {
      ocr: { firstName: 'Ali' },
      declared: { firstName: 'Ali' },
      face: { similarity: 0.8 },
      liveness: {
        passed: true,
        steps: [
          { action: 'TURN_LEFT', passed: true },
          { action: 'BLINK', passed: true },
        ],
      },
    } as any);

    expect(out.recommendation).toBe('APPROVED');
    expect(mockLiveness.consumeChallenge).toHaveBeenCalledWith('c1');
  });
});
