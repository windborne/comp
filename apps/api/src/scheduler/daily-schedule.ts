import type { SchedulerLog } from '../integration-platform/scheduling/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds from `now` until the next occurrence of HH:MM UTC (never 0). */
export function msUntilNextUtcTime({
  hour,
  minute = 0,
  now,
}: {
  hour: number;
  minute?: number;
  now: Date;
}): number {
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setTime(next.getTime() + MS_PER_DAY);
  }
  return next.getTime() - now.getTime();
}

export interface DailyJobDefinition {
  id: string;
  description: string;
  hourUtc: number;
  run: (log: SchedulerLog) => Promise<Record<string, unknown>>;
}

export type JobRunOutcome =
  | {
      status: 'completed';
      startedAt: string;
      durationMs: number;
      summary: Record<string, unknown>;
    }
  | { status: 'failed'; startedAt: string; durationMs: number; error: string }
  | { status: 'skipped'; reason: 'already-running' };

export interface DailyJobStatus {
  id: string;
  description: string;
  hourUtc: number;
  running: boolean;
  nextRunAt: string | null;
  lastRun: JobRunOutcome | null;
}

/**
 * Runs one job once a day at a fixed UTC time using a chained `setTimeout`.
 * Overlapping runs are skipped, a failing run never stops the schedule, and
 * the timer is unref'd so it cannot keep the process alive on shutdown.
 */
export class DailyJobRunner {
  private timer: NodeJS.Timeout | null = null;
  private nextRunAt: Date | null = null;
  private running = false;
  private lastRun: JobRunOutcome | null = null;

  constructor(
    private readonly definition: DailyJobDefinition,
    private readonly log: SchedulerLog,
    private readonly clock: () => Date = () => new Date(Date.now()),
  ) {}

  start(): void {
    if (this.timer) return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  status(): DailyJobStatus {
    return {
      id: this.definition.id,
      description: this.definition.description,
      hourUtc: this.definition.hourUtc,
      running: this.running,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      lastRun: this.lastRun,
    };
  }

  /** Runs the job immediately (used by the scheduled tick and the manual endpoint). */
  async runNow(): Promise<JobRunOutcome> {
    if (this.running) {
      this.log.warn(`Job ${this.definition.id} is already running; skipping`);
      return { status: 'skipped', reason: 'already-running' };
    }
    this.running = true;
    const startedAt = this.clock();
    this.log.info(`Job ${this.definition.id} starting`);
    try {
      const summary = await this.definition.run(this.log);
      const outcome: JobRunOutcome = {
        status: 'completed',
        startedAt: startedAt.toISOString(),
        durationMs: this.clock().getTime() - startedAt.getTime(),
        summary,
      };
      this.log.info(`Job ${this.definition.id} completed`, summary);
      this.lastRun = outcome;
      return outcome;
    } catch (error) {
      const outcome: JobRunOutcome = {
        status: 'failed',
        startedAt: startedAt.toISOString(),
        durationMs: this.clock().getTime() - startedAt.getTime(),
        error: error instanceof Error ? error.message : String(error),
      };
      this.log.error(`Job ${this.definition.id} failed`, {
        error: outcome.error,
      });
      this.lastRun = outcome;
      return outcome;
    } finally {
      this.running = false;
    }
  }

  private scheduleNext(): void {
    const now = this.clock();
    const delay = msUntilNextUtcTime({ hour: this.definition.hourUtc, now });
    this.nextRunAt = new Date(now.getTime() + delay);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runNow().finally(() => this.scheduleNext());
    }, delay);
    this.timer.unref();
  }
}
