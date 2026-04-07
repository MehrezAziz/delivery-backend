import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

type LivenessAction = 'TURN_LEFT' | 'TURN_RIGHT' | 'BLINK';

export interface ActiveChallenge {
  id: string;
  documentId: string;
  actions: LivenessAction[];
  expiresAt: Date;
  usedAt?: Date;
}

@Injectable()
export class LivenessChallengeService {
  private readonly ttlMs = 2 * 60 * 1000;
  private readonly keyPrefix = 'liveness:challenge:';

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async createChallenge(documentId: string, level: 'LOW' | 'MEDIUM' = 'LOW'): Promise<ActiveChallenge> {
    const challengeId = randomUUID();
    const pool: LivenessAction[] = ['TURN_LEFT', 'TURN_RIGHT', 'BLINK'];
    const count = level === 'MEDIUM' ? 3 : 2;
    const actions = this.shuffle(pool).slice(0, count);
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const challenge: ActiveChallenge = {
      id: challengeId,
      documentId,
      actions,
      expiresAt,
    };

    const redisPayload = {
      ...challenge,
      expiresAt: expiresAt.toISOString(),
      usedAt: null as string | null,
    };
    await this.redis.setex(
      this.buildKey(challengeId),
      Math.floor(this.ttlMs / 1000),
      JSON.stringify(redisPayload),
    );
    return challenge;
  }

  async getChallenge(challengeId: string): Promise<ActiveChallenge> {
    const raw = await this.redis.get(this.buildKey(challengeId));
    if (!raw) {
      throw new NotFoundException('Liveness challenge not found');
    }
    const challenge = JSON.parse(raw) as {
      id: string;
      documentId: string;
      actions: LivenessAction[];
      expiresAt: string;
      usedAt: string | null;
    };
    const out: ActiveChallenge = {
      id: challenge.id,
      documentId: challenge.documentId,
      actions: challenge.actions,
      expiresAt: new Date(challenge.expiresAt),
      usedAt: challenge.usedAt ? new Date(challenge.usedAt) : undefined,
    };
    if (out.expiresAt.getTime() < Date.now()) {
      await this.redis.del(this.buildKey(challengeId));
      throw new NotFoundException('Liveness challenge expired');
    }
    if (out.usedAt) {
      throw new BadRequestException('Liveness challenge already used');
    }
    return out;
  }

  async consumeChallenge(challengeId: string): Promise<void> {
    const key = this.buildKey(challengeId);
    const raw = await this.redis.get(key);
    if (!raw) return;
    const challenge = JSON.parse(raw) as {
      id: string;
      documentId: string;
      actions: LivenessAction[];
      expiresAt: string;
      usedAt: string | null;
    };
    if (challenge.usedAt) return;
    challenge.usedAt = new Date().toISOString();
    // Keep for short anti-replay window after use
    await this.redis.setex(key, 300, JSON.stringify(challenge));
  }

  private shuffle<T>(arr: T[]): T[] {
    const clone = [...arr];
    for (let i = clone.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  private buildKey(challengeId: string): string {
    return `${this.keyPrefix}${challengeId}`;
  }
}
