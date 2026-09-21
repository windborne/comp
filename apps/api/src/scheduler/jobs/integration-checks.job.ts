import { db } from '@db';
import {
  discoverDueIntegrationTasks,
  type OrgTaskCheck,
} from '../../integration-platform/scheduling/due-tasks';
import {
  sendBundledFailureEmails,
  type FailedTaskSummary,
} from '../../integration-platform/scheduling/failure-emails';
import { findDeviceSyncTargets } from '../../integration-platform/scheduling/sync-targets';
import type { SchedulerLog } from '../../integration-platform/scheduling/types';
import { runCheckForTask, syncDevices } from '../loopback-client';

export interface IntegrationChecksJobSummary extends Record<string, unknown> {
  organizations: number;
  tasks: number;
  checksRun: number;
  checksErrored: number;
  tasksNewlyFailed: number;
  deviceSyncs: number;
  deviceSyncFailures: number;
}

interface TaskOutcome {
  hadErrors: boolean;
  totalPassing: number;
  totalFindings: number;
  statuses: Array<string | null>;
}

/**
 * The run-check endpoint evaluates the task from the check it just ran, so for
 * a task with several checks the last call decides. Combine them the way the
 * Trigger.dev runner does: any failed check fails the task; all done → done.
 */
export function combineTaskStatus(
  statuses: Array<string | null>,
): 'failed' | 'done' | null {
  if (statuses.length === 0) return null;
  if (statuses.includes('failed')) return 'failed';
  if (statuses.every((s) => s === 'done')) return 'done';
  return null;
}

async function runTaskChecks({
  organizationId,
  task,
  log,
}: {
  organizationId: string;
  task: OrgTaskCheck;
  log: SchedulerLog;
}): Promise<TaskOutcome> {
  const outcome: TaskOutcome = {
    hadErrors: false,
    totalPassing: 0,
    totalFindings: 0,
    statuses: [],
  };
  for (const checkId of task.checkIds) {
    try {
      const result = await runCheckForTask({
        organizationId,
        taskId: task.taskId,
        connectionId: task.connectionId,
        checkId,
      });
      outcome.totalPassing += result.totalPassing ?? 0;
      outcome.totalFindings += result.totalFindings ?? 0;
      outcome.statuses.push(result.taskStatus ?? null);
      if (!result.success || result.hadErrors) outcome.hadErrors = true;
    } catch (error) {
      outcome.hadErrors = true;
      log.error(`Check ${checkId} failed for task ${task.taskId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcome;
}

/**
 * In-process equivalent of the Trigger.dev daily integration checks: runs every
 * due task's checks through the API's own run-check endpoint, records the run
 * on the task, bundles freshly failed tasks into one email per org, then runs
 * device sync for orgs that configured it.
 */
export async function runIntegrationChecksJob(
  log: SchedulerLog,
): Promise<IntegrationChecksJobSummary> {
  const { tasksToRun, orgGroups } = await discoverDueIntegrationTasks({
    now: new Date(Date.now()),
    log,
  });
  const summary: IntegrationChecksJobSummary = {
    organizations: orgGroups.length,
    tasks: tasksToRun.length,
    checksRun: 0,
    checksErrored: 0,
    tasksNewlyFailed: 0,
    deviceSyncs: 0,
    deviceSyncFailures: 0,
  };

  for (const group of orgGroups) {
    const failedTasks: FailedTaskSummary[] = [];
    for (const task of group.tasks) {
      const before = await db.task.findUnique({
        where: { id: task.taskId },
        select: { status: true },
      });
      const outcome = await runTaskChecks({
        organizationId: group.organizationId,
        task,
        log,
      });
      summary.checksRun += outcome.statuses.length;
      summary.checksErrored += task.checkIds.length - outcome.statuses.length;

      // Only a run where every check executed counts as "ran" for the
      // schedule, so an errored check retries on the next tick.
      if (!outcome.hadErrors) {
        await db.task.update({
          where: { id: task.taskId },
          data: { integrationLastRunAt: new Date(Date.now()) },
        });
      }

      const finalStatus = combineTaskStatus(outcome.statuses);
      const lastStatus = outcome.statuses.at(-1) ?? null;
      if (finalStatus && finalStatus !== lastStatus) {
        await db.task.update({
          where: { id: task.taskId },
          data: { status: finalStatus },
        });
      }
      if (finalStatus === 'failed' && before?.status !== 'failed') {
        failedTasks.push({
          taskId: task.taskId,
          taskTitle: task.taskTitle,
          failedCount: outcome.totalFindings,
          totalCount: outcome.totalPassing + outcome.totalFindings,
        });
      }
    }
    summary.tasksNewlyFailed += failedTasks.length;
    await sendBundledFailureEmails({
      organizationId: group.organizationId,
      organizationName: group.organizationName,
      failedTasks,
      log,
    });
  }

  for (const target of await findDeviceSyncTargets({ log })) {
    try {
      await syncDevices(target);
      summary.deviceSyncs++;
    } catch (error) {
      summary.deviceSyncFailures++;
      log.error(`Device sync failed for org ${target.organizationId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
