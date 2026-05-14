import { Injectable } from '@nestjs/common';

/** Short window after Security screen gate: allow password/PIN changes without re-entering current values. */
const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class SecuritySessionService {
  private readonly unlockUntil = new Map<string, number>();

  grant(userId: string): void {
    this.unlockUntil.set(userId, Date.now() + WINDOW_MS);
  }

  isActive(userId: string): boolean {
    const t = this.unlockUntil.get(userId);
    return !!t && t > Date.now();
  }

  clear(userId: string): void {
    this.unlockUntil.delete(userId);
  }
}
