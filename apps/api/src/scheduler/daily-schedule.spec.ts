import { DailyJobRunner, msUntilNextUtcTime } from './daily-schedule';

const silentLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('msUntilNextUtcTime', () => {
  it('targets later today when the time has not passed yet', () => {
    const now = new Date('2026-09-21T03:30:00.000Z');
    expect(msUntilNextUtcTime({ hour: 6, now })).toBe(2.5 * 60 * 60 * 1000);
  });

  it('rolls over to tomorrow once the time has passed', () => {
    const now = new Date('2026-09-21T06:00:00.000Z');
    expect(msUntilNextUtcTime({ hour: 6, now })).toBe(24 * 60 * 60 * 1000);
  });
});

describe('DailyJobRunner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-21T05:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs at the scheduled UTC hour and reschedules for the next day', async () => {
    const run = jest.fn().mockResolvedValue({ ok: true });
    const runner = new DailyJobRunner(
      { id: 'job', description: 'test', hourUtc: 6, run },
      silentLog,
    );

    runner.start();
    expect(runner.status().nextRunAt).toBe('2026-09-21T06:00:00.000Z');

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(runner.status().lastRun).toEqual(
      expect.objectContaining({ status: 'completed', summary: { ok: true } }),
    );
    expect(runner.status().nextRunAt).toBe('2026-09-22T06:00:00.000Z');

    runner.stop();
    expect(runner.status().nextRunAt).toBeNull();
  });

  it('records a failure and keeps the schedule alive', async () => {
    const run = jest.fn().mockRejectedValue(new Error('boom'));
    const runner = new DailyJobRunner(
      { id: 'job', description: 'test', hourUtc: 6, run },
      silentLog,
    );

    runner.start();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(runner.status().lastRun).toEqual(
      expect.objectContaining({ status: 'failed', error: 'boom' }),
    );
    expect(runner.status().nextRunAt).toBe('2026-09-22T06:00:00.000Z');
    runner.stop();
  });

  it('skips a manual run while the job is already running', async () => {
    let finish: () => void = () => undefined;
    const run = jest.fn(
      () =>
        new Promise<Record<string, unknown>>(
          (resolve) => (finish = () => resolve({})),
        ),
    );
    const runner = new DailyJobRunner(
      { id: 'job', description: 'test', hourUtc: 6, run },
      silentLog,
    );

    const first = runner.runNow();
    await expect(runner.runNow()).resolves.toEqual({
      status: 'skipped',
      reason: 'already-running',
    });
    finish();
    await expect(first).resolves.toEqual(
      expect.objectContaining({ status: 'completed' }),
    );
  });
});
