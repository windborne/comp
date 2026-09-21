import { logger, queue, task } from '@trigger.dev/sdk';
import type { OrgTaskCheck } from '../../integration-platform/scheduling/due-tasks';
import {
  collectFailedTasks,
  sendBundledFailureEmails,
  type FailedTaskSummary,
} from '../../integration-platform/scheduling/failure-emails';
import { runTaskIntegrationChecks } from './run-task-integration-checks';

// The bundling helpers live in integration-platform/scheduling so the
// self-hosted in-process scheduler shares them; re-exported for existing callers.
export {
  collectFailedTasks,
  sendBundledFailureEmails,
} from '../../integration-platform/scheduling/failure-emails';
export type { FailedTaskSummary } from '../../integration-platform/scheduling/failure-emails';
export type { OrgTaskCheck } from '../../integration-platform/scheduling/due-tasks';

// Bound how many per-org runners wait concurrently. The child checks run on the
// default queue at full env concurrency; only the PARENTS are capped here, so a
// day with many orgs can't pin the whole environment with runners that are
// merely suspended waiting on their children.
const orgRunnerQueue = queue({
  name: 'integration-checks-org-runner',
  concurrencyLimit: 50,
});

// Chunk large orgs: batchTriggerAndWait accepts a bounded number of items per
// call (the orchestrator already self-limits its own triggers the same way).
const CHILD_BATCH_SIZE = 100;

/**
 * Per-org runner. The daily orchestrator dispatches ONE of these per org
 * (fire-and-forget). It runs that org's due integration checks in parallel via
 * batchTriggerAndWait, then sends a SINGLE bundled email listing every task that
 * failed this run — instead of one email per failing task.
 *
 * Mirrors the established in-repo nested fan-out pattern (e.g. onboarding's
 * per-org runners that batchTriggerAndWait their work internally).
 */
export const runOrgIntegrationChecks = task({
  id: 'run-org-integration-checks',
  queue: orgRunnerQueue,
  // maxDuration is max COMPUTE time in SECONDS (the suspended wait during
  // batchTriggerAndWait is checkpointed and doesn't count against it). 1h is
  // ample for the runner's own work (collect results + send emails) and matches
  // the sibling batchTriggerAndWait orchestrator (process-knowledge-base-documents).
  maxDuration: 60 * 60, // 1 hour (in seconds)
  run: async (payload: {
    organizationId: string;
    organizationName: string;
    tasks: OrgTaskCheck[];
  }) => {
    const { organizationId, organizationName, tasks } = payload;

    logger.info(
      `Running integration checks for org ${organizationId} (${tasks.length} task(s))`,
    );

    if (tasks.length === 0) {
      return { organizationId, tasksRun: 0, failedTasks: 0, emailed: false };
    }

    const failedTasks: FailedTaskSummary[] = [];

    for (let i = 0; i < tasks.length; i += CHILD_BATCH_SIZE) {
      const batch = tasks.slice(i, i + CHILD_BATCH_SIZE);
      const batchResult = await runTaskIntegrationChecks.batchTriggerAndWait(
        batch.map((t) => ({
          payload: {
            taskId: t.taskId,
            taskTitle: t.taskTitle,
            connectionId: t.connectionId,
            providerSlug: t.providerSlug,
            organizationId,
            checkIds: t.checkIds,
          },
        })),
      );
      failedTasks.push(...collectFailedTasks(batchResult.runs));
    }

    logger.info(
      `Org ${organizationId}: ${failedTasks.length} of ${tasks.length} task(s) transitioned to failed`,
    );

    await sendBundledFailureEmails({
      organizationId,
      organizationName,
      failedTasks,
      log: logger,
    });

    return {
      organizationId,
      tasksRun: tasks.length,
      failedTasks: failedTasks.length,
      emailed: failedTasks.length > 0,
    };
  },
});
