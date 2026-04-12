/**
 * Central place for “needs human / needs team” detection (Phase 0 handoff rules in code).
 */

const HUMAN_INTENT_PATTERNS: RegExp[] = [
  /\bhuman\b/,
  /\bagent\b/,
  /\boperator\b/,
  /\breal (person|human|agent|support)\b/,
  /\bspeak to (someone|a person|an agent|support)\b/,
  /\btalk to (someone|a person|an agent|support)\b/,
  /\bconnect me (to|with)\b/,
  /\bmanager\b/,
  /\bescalate\b/,
  /\blive (support|agent|person)\b/,
  /\bcustomer service\b/,
  /\bsupport team\b/,
  /\bsomeone real\b/,
  /\breal person\b/,
  /\bconseiller\b/i,
  /\bhumain\b/i,
  /\bun (vrai )?conseiller\b/i,
];

/** Money / legal / safety topics the bot must not own — notify team like a human request. */
const SENSITIVE_ESCALATION_PATTERNS: RegExp[] = [
  /\brefund\b/i,
  /\breimburs/i,
  /\bmoney back\b/i,
  /\bchargeback\b/i,
  /\blawyer\b/i,
  /\blawsuit\b/i,
  /\bsue\b/i,
  /\blegal (action|letter|notice)\b/i,
  /\bconsumer (protection|rights)\b/i,
  /\bpolice\b/i,
  /\bauthorities\b/i,
  /\bcourt\b/i,
  /\bdata breach\b/i,
  /\baccount (hacked|stolen)\b/i,
  /\bunauthorized (charge|payment|transaction)\b/i,
];

/** Soft frustration — no auto-escalation; used to tune assistant tone in system prompt. */
const FRUSTRATION_HINT_PATTERNS: RegExp[] = [
  /\b(this is )?(ridiculous|unacceptable)\b/i,
  /\buseless\b/i,
  /\bwaste of time\b/i,
  /\bscam\b/i,
  /\bnot working\b/i,
  /\bstill waiting\b/i,
  /\bjamais\b/i,
  /\bnul\b/i,
];

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  const t = text.toLowerCase();
  return patterns.some((p) => {
    p.lastIndex = 0;
    return p.test(t);
  });
}

export function userRequestedHuman(text: string): boolean {
  return matchesAny(text, HUMAN_INTENT_PATTERNS);
}

export function sensitiveTopicNeedsTeam(text: string): boolean {
  return matchesAny(text, SENSITIVE_ESCALATION_PATTERNS);
}

/** Either explicit human intent or sensitive topic → same escalation path as before. */
export function needsHumanEscalationNotification(text: string): boolean {
  return userRequestedHuman(text) || sensitiveTopicNeedsTeam(text);
}

export function userSignalsFrustration(text: string): boolean {
  return matchesAny(text, FRUSTRATION_HINT_PATTERNS);
}
