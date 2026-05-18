import {
  Game,
  GameCustomPeriodAnchor,
  GamePeriodMode,
} from '@prisma/client';
import {
  addDaysToDateKey,
  tunisiaDateKey,
  tunisiaDayStartUtc,
  tunisiaParts,
} from './games-time.util';

export interface GamePeriodBounds {
  periodStart: Date;
  periodEnd: Date;
  periodKey: string;
}

function monthStartKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function weekStartKey(dateKey: string): string {
  const d = tunisiaDayStartUtc(dateKey);
  const p = tunisiaParts(d);
  const day = p.weekday;
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return tunisiaDateKey(d);
}

export function getCurrentPeriod(game: Game, at = new Date()): GamePeriodBounds {
  const dateKey = tunisiaDateKey(at);
  const p = tunisiaParts(at);

  if (game.periodMode === GamePeriodMode.DAILY) {
    const start = tunisiaDayStartUtc(dateKey);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { periodStart: start, periodEnd: end, periodKey: dateKey };
  }

  if (game.periodMode === GamePeriodMode.WEEKLY) {
    const ws = weekStartKey(dateKey);
    const start = tunisiaDayStartUtc(ws);
    const endKey = addDaysToDateKey(ws, 7);
    const end = tunisiaDayStartUtc(endKey);
    return { periodStart: start, periodEnd: end, periodKey: `W:${ws}` };
  }

  if (game.periodMode === GamePeriodMode.MONTHLY) {
    const mk = monthStartKey(p.year, p.month);
    const start = tunisiaDayStartUtc(mk);
    const nextMonth = p.month === 12 ? 1 : p.month + 1;
    const nextYear = p.month === 12 ? p.year + 1 : p.year;
    const end = tunisiaDayStartUtc(monthStartKey(nextYear, nextMonth));
    return { periodStart: start, periodEnd: end, periodKey: `M:${mk}` };
  }

  const days = game.customPeriodDays ?? 5;
  const anchor = game.customPeriodAnchor ?? GameCustomPeriodAnchor.FIXED_BLOCKS;
  const gameStartKey = tunisiaDateKey(game.createdAt);

  if (anchor === GameCustomPeriodAnchor.ROLLING) {
    const startKey = gameStartKey;
    let cursor = startKey;
    let blockStart = startKey;
    while (true) {
      const next = addDaysToDateKey(cursor, days);
      if (dateKey < next) break;
      blockStart = cursor;
      cursor = next;
    }
    const periodStart = tunisiaDayStartUtc(blockStart);
    const endKey = addDaysToDateKey(blockStart, days);
    const periodEnd = tunisiaDayStartUtc(endKey);
    return {
      periodStart,
      periodEnd,
      periodKey: `C:${blockStart}:${days}`,
    };
  }

  const startUtc = tunisiaDayStartUtc(gameStartKey).getTime();
  const nowUtc = tunisiaDayStartUtc(dateKey).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsed = Math.floor((nowUtc - startUtc) / dayMs);
  const blockIndex = Math.floor(elapsed / days);
  const blockStartKey = addDaysToDateKey(gameStartKey, blockIndex * days);
  const periodStart = tunisiaDayStartUtc(blockStartKey);
  const periodEnd = tunisiaDayStartUtc(addDaysToDateKey(blockStartKey, days));
  return {
    periodStart,
    periodEnd,
    periodKey: `F:${blockStartKey}:${days}`,
  };
}

export function getPreviousPeriod(game: Game, at = new Date()): GamePeriodBounds {
  const current = getCurrentPeriod(game, at);
  return getCurrentPeriod(game, new Date(current.periodStart.getTime() - 1000));
}
