import { logger, schedules } from '@trigger.dev/sdk';
import { discoverDueIntegrationTasks } from '../../integration-platform/scheduling/due-tasks';
import { findDeviceSyncTargets } from '../../integration-platform/scheduling/sync-targets';
import { runDeviceSync } from './run-device-sync';
import { runOrgIntegrationChecks } from './run-org-integration-checks';

// The discovery helpers live in integration-platform/scheduling so the
// self-hosted in-process scheduler shares them; re-exported for existing callers.
export {
  filterDueTasks,
  groupTasksByOrg,
  resolveProviderChecks,
} from '../../integration-platform/scheduling/due-tasks';
export type {
  OrgTaskGroup,
  ProviderCheck,
  ScheduledTask,
} from '../../integration-platform/scheduling/due-tasks';

/**
 * Daily scheduled task (orchestrator) that finds all tasks with integration
 * checks due today and dispatches ONE per-org runner for each organization.
 *
 * Self-hosted installs without a Trigger.dev worker get the same behaviour
 * from the in-process scheduler (apps/api/src/scheduler), which runs the same
 * discovery and calls the API's own check endpoints.
 */
export const integrationChecksSchedule = schedules.task({
  id: 'integration-checks-schedule',
  cron: '0 6 * * *', // Daily at 6:00 AM UTC
  maxDuration: 1000 * 60 * 60, // 1 hour
  run: async (payload) => {
    logger.info('Starting daily integration checks orchestrator', {
      scheduledAt: payload.timestamp,
      lastRun: payload.lastTimestamp,
    });

    const { tasksToRun, orgGroups } = await discoverDueIntegrationTasks({
      now: new Date(),
      log: logger,
    });

    // Dispatch ONE runner per org (fire-and-forget). Each runner waits on its
    // own tasks and sends a SINGLE bundled failure email, and a slow/failing
    // org can't hold the whole daily run open.
    let tasksTriggered = 0;
    let orgsTriggered = 0;
    if (orgGroups.length === 0) {
      logger.info('No tasks with mapped integration checks found');
    } else {
      logger.info(
        `Found ${tasksToRun.length} task(s) across ${orgGroups.length} org(s) to run`,
      );
      // batchTrigger accepts a bounded number of items per call.
      const ORG_BATCH_SIZE = 100;
      const triggerPayloads = orgGroups.map((g) => ({ payload: g }));
      try {
        for (let i = 0; i < triggerPayloads.length; i += ORG_BATCH_SIZE) {
          const batch = triggerPayloads.slice(i, i + ORG_BATCH_SIZE);
          await runOrgIntegrationChecks.batchTrigger(batch);
          orgsTriggered += batch.length;
          tasksTriggered += batch.reduce(
            (n, p) => n + p.payload.tasks.length,
            0,
          );
          logger.info(
            `Triggered org batch ${Math.floor(i / ORG_BATCH_SIZE) + 1}: ${batch.length} org(s)`,
          );
        }
        logger.info(
          `Triggered ${orgsTriggered} org runner(s) covering ${tasksTriggered} task(s)`,
        );
      } catch (error) {
        logger.error('Failed to trigger org integration check runs', {
          error: error instanceof Error ? error.message : String(error),
          orgsTriggeredBeforeError: orgsTriggered,
        });
      }
    }

    // === Device Sync ===
    const deviceSyncTargets = await findDeviceSyncTargets({ log: logger });
    let deviceSyncsTriggered = 0;
    let deviceSyncFailures = 0;
    for (const target of deviceSyncTargets) {
      try {
        await runDeviceSync.trigger({
          organizationId: target.organizationId,
          connectionId: target.connectionId,
          providerSlug: target.providerSlug,
        });
        deviceSyncsTriggered++;
      } catch (error) {
        deviceSyncFailures++;
        logger.error(
          `Failed to trigger device sync for org ${target.organizationId}`,
          { error: error instanceof Error ? error.message : String(error) },
        );
      }
    }
    logger.info(`Triggered ${deviceSyncsTriggered} device syncs`);

    return {
      // Report failure when not every queued task was dispatched OR a
      // device-sync dispatch threw, so partial/failed runs aren't masked.
      success: tasksTriggered === tasksToRun.length && deviceSyncFailures === 0,
      tasksTriggered,
      orgsTriggered,
      deviceSyncsTriggered,
    };
  },
});
