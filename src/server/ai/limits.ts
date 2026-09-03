/** Per-Teacher AI generation guardrails. Pure logic — the generate route
 * wires these to Prisma and the provider. */

export const DEFAULT_GENERATIONS_PER_HOUR = 30;
export const DEFAULT_MAX_CONCURRENT_GENERATIONS = 2;
export const DEFAULT_MAX_TOTAL_SOURCE_CHARS = 120_000;

export const GENERATION_WINDOW_MS = 60 * 60 * 1000;

type LimitsEnvironment = {
  [key: string]: string | undefined;
  AI_GENERATIONS_PER_HOUR?: string;
  AI_MAX_CONCURRENT_GENERATIONS?: string;
  AI_MAX_TOTAL_SOURCE_CHARS?: string;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function generationsPerHour(env: LimitsEnvironment = process.env): number {
  return positiveInt(env.AI_GENERATIONS_PER_HOUR, DEFAULT_GENERATIONS_PER_HOUR);
}

export function maxConcurrentGenerations(env: LimitsEnvironment = process.env): number {
  return positiveInt(env.AI_MAX_CONCURRENT_GENERATIONS, DEFAULT_MAX_CONCURRENT_GENERATIONS);
}

export function maxTotalSourceChars(env: LimitsEnvironment = process.env): number {
  return positiveInt(env.AI_MAX_TOTAL_SOURCE_CHARS, DEFAULT_MAX_TOTAL_SOURCE_CHARS);
}

/** Seconds until the oldest counted generation leaves the window (>= 1). */
export function retryAfterSeconds(oldestCountedAt: Date, now = Date.now()): number {
  return Math.max(1, Math.ceil((oldestCountedAt.getTime() + GENERATION_WINDOW_MS - now) / 1000));
}

export function totalSourceChars(sources: { text: string }[]): number {
  return sources.reduce((total, source) => total + source.text.length, 0);
}

// ponytail: in-process counters — correct while deployment stays one Node
// process (per ADR 0001); move to a shared store if the app ever scales out.
const activeGenerations = new Map<string, number>();

export function acquireGenerationSlot(teacherId: string, limit = DEFAULT_MAX_CONCURRENT_GENERATIONS): boolean {
  const current = activeGenerations.get(teacherId) ?? 0;
  if (current >= limit) return false;
  activeGenerations.set(teacherId, current + 1);
  return true;
}

export function releaseGenerationSlot(teacherId: string): void {
  const current = activeGenerations.get(teacherId) ?? 0;
  if (current <= 1) activeGenerations.delete(teacherId);
  else activeGenerations.set(teacherId, current - 1);
}
