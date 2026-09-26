import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  nestSchedulerLog,
  type SchedulerLog,
} from '../integration-platform/scheduling/types';
import {
  DailyJobRunner,
  type DailyJobDefinition,
  type DailyJobStatus,
  type JobRunOutcome,
} from './daily-schedule';
import { CheckrBackgroundCheckSyncService } from '../integration-platform/checkr/checkr-background-check-sync.service';
import { runBackgroundCheckSyncJob } from './jobs/background-check-sync.job';
import { runEmployeeSyncJob } from './jobs/employee-sync.job';
import { runIntegrationChecksJob } from './jobs/integration-checks.job';
import { runTokenRefreshJob } from './jobs/token-refresh.job';
import { isLoopbackConfigured } from './loopback-client';

export type SchedulerMode =
  | 'trigger' // a Trigger.dev worker owns the schedules
  | 'disabled' // SELF_HOSTED_SCHEDULER=false
  | 'unconfigured' // self-hosted, but SERVICE_TOKEN_TRIGGER is missing
  | 'self-hosted';

/** Which runtime owns the daily schedules, from the environment. */
export function resolveSchedulerMode(env: NodeJS.ProcessEnv): SchedulerMode {
  if (env.TRIGGER_SECRET_KEY) return 'trigger';
  if (env.SELF_HOSTED_SCHEDULER === 'false') return 'disabled';
  if (!env.SERVICE_TOKEN_TRIGGER) return 'unconfigured';
  return 'self-hosted';
}

/** Same UTC times as the Trigger.dev schedules they replace. */
export const SELF_HOSTED_JOBS: DailyJobDefinition[] = [
  {
    id: 'token-refresh',
    description: 'Refresh OAuth tokens expiring within 24h',
    hourUtc: 5,
    run: runTokenRefreshJob,
  },
  {
    id: 'integration-checks',
    description: 'Run due integration checks and device sync',
    hourUtc: 6,
    run: runIntegrationChecksJob,
  },
  {
    id: 'employee-sync',
    description: 'Sync employees from the configured provider',
    hourUtc: 7,
    run: runEmployeeSyncJob,
  },
];

/**
 * Runs the daily integration schedules inside the API when no Trigger.dev
 * worker is configured (self-hosted installs). With TRIGGER_SECRET_KEY set
 * this service does nothing, so hosted deployments are unaffected.
 */
@Injectable()
export class SelfHostedSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SelfHostedSchedulerService.name);
  private readonly log: SchedulerLog = nestSchedulerLog(this.logger);
  private readonly runners = new Map<string, DailyJobRunner>();
  readonly mode: SchedulerMode = resolveSchedulerMode(process.env);
  private readonly definitions: DailyJobDefinition[];

  constructor(@Optional() checkrSync?: CheckrBackgroundCheckSyncService) {
    this.definitions = [
      ...SELF_HOSTED_JOBS,
      ...(checkrSync
        ? [
            {
              // After the employee sync, so new hires exist before their checks are matched.
              // Calls the service in-process: the sync needs member:update, which the
              // loopback service token deliberately lacks.
              id: 'background-check-sync',
              description: 'Sync background checks from Checkr',
              hourUtc: 8,
              run: (log: SchedulerLog) =>
                runBackgroundCheckSyncJob({ log, sync: (args) => checkrSync.sync(args) }),
            },
          ]
        : []),
    ];
  }

  onApplicationBootstrap(): void {
    if (this.mode === 'trigger') return;
    if (this.mode === 'disabled') {
      this.logger.log(
        'Self-hosted scheduler disabled by SELF_HOSTED_SCHEDULER=false',
      );
      return;
    }
    if (this.mode === 'unconfigured') {
      this.logger.warn(
        'No Trigger.dev worker and SERVICE_TOKEN_TRIGGER is unset: daily integration checks, token refresh and employee sync will not run. Set SERVICE_TOKEN_TRIGGER to enable the in-process scheduler.',
      );
      return;
    }
    for (const definition of this.definitions) {
      const runner = new DailyJobRunner(definition, this.log);
      runner.start();
      this.runners.set(definition.id, runner);
    }
    this.logger.log(
      `Self-hosted scheduler started: ${this.definitions.map((j) => `${j.id}@${String(j.hourUtc).padStart(2, '0')}:00Z`).join(', ')}`,
    );
  }

  onApplicationShutdown(): void {
    for (const runner of this.runners.values()) runner.stop();
    this.runners.clear();
  }

  listJobs(): { mode: SchedulerMode; jobs: DailyJobStatus[] } {
    return {
      mode: this.mode,
      jobs: Array.from(this.runners.values()).map((r) => r.status()),
    };
  }

  /** Runs a job now, regardless of its schedule (manual kick from the internal endpoint). */
  async runJob(jobId: string): Promise<JobRunOutcome> {
    const definition = this.definitions.find((j) => j.id === jobId);
    if (!definition) {
      throw new NotFoundException(`Unknown scheduler job: ${jobId}`);
    }
    if (!isLoopbackConfigured()) {
      throw new ServiceUnavailableException(
        'SERVICE_TOKEN_TRIGGER is not set; the in-process scheduler cannot call the API',
      );
    }
    const runner =
      this.runners.get(jobId) ?? new DailyJobRunner(definition, this.log);
    return runner.runNow();
  }
}
