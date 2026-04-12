import {
  needsHumanEscalationNotification,
  sensitiveTopicNeedsTeam,
  userRequestedHuman,
  userSignalsFrustration,
} from './ai-support-handoff';

describe('ai-support-handoff', () => {
  it('detects human intent', () => {
    expect(userRequestedHuman('Can I talk to a human please')).toBe(true);
    expect(userRequestedHuman('What is my order status')).toBe(false);
  });

  it('detects sensitive escalation topics', () => {
    expect(sensitiveTopicNeedsTeam('I want a refund for this order')).toBe(true);
    expect(sensitiveTopicNeedsTeam('I need a lawyer')).toBe(true);
    expect(sensitiveTopicNeedsTeam('Where is my package')).toBe(false);
  });

  it('combines for team notification', () => {
    expect(needsHumanEscalationNotification('connect me to an agent')).toBe(true);
    expect(needsHumanEscalationNotification('chargeback on my card')).toBe(true);
  });

  it('detects frustration hints without requiring escalation', () => {
    expect(userSignalsFrustration('This is ridiculous')).toBe(true);
    expect(userSignalsFrustration('Thanks')).toBe(false);
  });
});
