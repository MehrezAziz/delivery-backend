import { VerificationRulesService } from './verification-rules.service';

describe('VerificationRulesService', () => {
  let service: VerificationRulesService;

  beforeEach(() => {
    service = new VerificationRulesService();
  });

  it('only scores fields with non-empty declared values', () => {
    const out = service.scoreTextConsistency(
      {
        firstName: 'Ali',
        lastName: '',
        idNumber: undefined,
        dateOfBirth: undefined,
      },
      {
        firstName: 'Ali',
        lastName: 'Different',
        idNumber: 'X123',
        dateOfBirth: '2000-01-01',
      },
    );
    expect(out.fields.length).toBe(1);
    expect(out.fields[0].field).toBe('firstName');
    expect(out.score).toBeGreaterThanOrEqual(0.99);
  });

  it('scores exact text match close to 1', () => {
    const out = service.scoreTextConsistency(
      {
        firstName: 'Ali',
        lastName: 'Ben Ali',
        idNumber: 'AB123456',
        dateOfBirth: '1998-01-10',
      },
      {
        firstName: 'Ali',
        lastName: 'Ben Ali',
        idNumber: 'AB123456',
        dateOfBirth: '1998-01-10',
      },
    );
    expect(out.score).toBeGreaterThanOrEqual(0.99);
  });

  it('returns REVIEW when liveness passes but text mismatch exists', () => {
    const decision = service.decideVerification({
      textScore: 0.5,
      faceSimilarity: 0.7,
      livenessPassed: true,
    });
    expect(decision.decision).toBe('REVIEW');
  });

  it('returns REJECTED when liveness fails', () => {
    const decision = service.decideVerification({
      textScore: 0.95,
      faceSimilarity: 0.95,
      livenessPassed: false,
    });
    expect(decision.decision).toBe('REJECTED');
  });
});
