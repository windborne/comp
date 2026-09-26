import { db } from '@db';
import type { SchedulerLog } from '../../integration-platform/scheduling/types';
import { syncCheckrBackgroundChecks } from '../loopback-client';

export interface BackgroundCheckSyncJobSummary extends Record<string, unknown> {
  connections: number;
  succeeded: number;
  failed: number;
  created: number;
  updated: number;
}

/**
 * Daily Checkr sync: brings every organization's background-check records in
 * line with Checkr through the API's own sync endpoint.
 */
export async function runBackgroundCheckSyncJob(
  log: SchedulerLog,
): Promise<BackgroundCheckSyncJobSummary> {
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
      const result = await syncCheckrBackgroundChecks({
        organizationId: connection.organizationId,
        connectionId: connection.id,
      });
      summary.succeeded++;
      summary.created += result.created ?? 0;
      summary.updated += result.updated ?? 0;
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
