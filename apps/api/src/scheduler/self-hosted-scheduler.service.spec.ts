jest.mock('./jobs/integration-checks.job', () => ({
  runIntegrationChecksJob: jest.fn(),
}));
jest.mock('./jobs/token-refresh.job', () => ({
  runTokenRefreshJob: jest.fn(),
}));
jest.mock('./jobs/employee-sync.job', () => ({
  runEmployeeSyncJob: jest.fn(),
}));
jest.mock('./jobs/background-check-sync.job', () => ({
  runBackgroundCheckSyncJob: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { runIntegrationChecksJob } from './jobs/integration-checks.job';
import {
  resolveSchedulerMode,
  SelfHostedSchedulerService,
} from './self-hosted-scheduler.service';

describe('resolveSchedulerMode', () => {
  it('defers to Trigger.dev when a worker is configured', () => {
    expect(resolveSchedulerMode({ TRIGGER_SECRET_KEY: 'tr' })).toBe('trigger');
  });

  it('can be switched off explicitly', () => {
    expect(
      resolveSchedulerMode({
        SELF_HOSTED_SCHEDULER: 'false',
        SERVICE_TOKEN_TRIGGER: 't',
      }),
    ).toBe('disabled');
  });

  it('needs the service token to call the API', () => {
    expect(resolveSchedulerMode({})).toBe('unconfigured');
    expect(resolveSchedulerMode({ SERVICE_TOKEN_TRIGGER: 't' })).toBe(
      'self-hosted',
    );
  });
});

describe('SelfHostedSchedulerService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SERVICE_TOKEN_TRIGGER: 'svc' };
    delete process.env.TRIGGER_SECRET_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('schedules the daily jobs on a self-hosted install', () => {
    const service = new SelfHostedSchedulerService();
    service.onApplicationBootstrap();

    const { mode, jobs } = service.listJobs();
    expect(mode).toBe('self-hosted');
    expect(jobs.map((j) => [j.id, j.hourUtc])).toEqual([
      ['token-refresh', 5],
      ['integration-checks', 6],
      ['employee-sync', 7],
      ['background-check-sync', 8],
    ]);
    expect(jobs.every((j) => j.nextRunAt !== null)).toBe(true);

    service.onApplicationShutdown();
    expect(service.listJobs().jobs).toEqual([]);
  });

  it('schedules nothing when Trigger.dev owns the schedules', () => {
    process.env.TRIGGER_SECRET_KEY = 'tr';
    const service = new SelfHostedSchedulerService();
    service.onApplicationBootstrap();

    expect(service.listJobs()).toEqual({ mode: 'trigger', jobs: [] });
  });

  it('runs a job on demand and rejects unknown ids', async () => {
    (runIntegrationChecksJob as jest.Mock).mockResolvedValue({ tasks: 0 });
    const service = new SelfHostedSchedulerService();

    await expect(service.runJob('integration-checks')).resolves.toEqual(
      expect.objectContaining({ status: 'completed', summary: { tasks: 0 } }),
    );
    await expect(service.runJob('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
