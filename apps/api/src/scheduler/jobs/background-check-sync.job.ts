import { db } from '@db';
import type { SchedulerLog } from '../../integration-platform/scheduling/types';

export interface BackgroundCheckSyncJobSummary extends Record<string, unknown> {
  connections: number;
  succeeded: number;
  failed: number;
  created: number;
  updated: number;
}

type CheckrSync = (args: { organizationId: string; connectionId: string }) => Promise<{
  created: number;
  updated: number;
  activeMembersWithoutCompletedCheck: number;
}>;

/**
 * Daily Checkr sync: brings every organization's background-check records in
 * line with Checkr. Runs the sync service in-process (no acting user, so no
 * per-member audit rows; the scheduler log records the run).
 */
export async function runBackgroundCheckSyncJob({
  log,
  sync,
}: {
  log: SchedulerLog;
  sync: CheckrSync;
}): Promise<BackgroundCheckSyncJobSummary> {
  const connections = await db.integrationConnection.findMany({
    where: { status: 'active', provider: { slug: 'checkr' } },
    select: { id: true, organizationId: true },
  });
  const summary: BackgroundCheckSyncJobSummary = {
    connections: connections.length,
    succeeded: 0,
    failed: 0,
    created: 0,
    updated: 0,
  };

  for (const connection of connections) {
    try {
      const result = await sync({ organizationId: connection.organizationId, connectionId: connection.id });
      summary.succeeded++;
      summary.created += result.created;
      summary.updated += result.updated;
      log.info('Checkr background-check sync completed', {
        organizationId: connection.organizationId,
        created: result.created,
        updated: result.updated,
        withoutCompletedCheck: result.activeMembersWithoutCompletedCheck,
      });
    } catch (error) {
      summary.failed++;
      log.error('Checkr background-check sync failed', {
        organizationId: connection.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
