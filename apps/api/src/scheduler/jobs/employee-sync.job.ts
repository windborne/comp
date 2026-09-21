import { findEmployeeSyncConnections } from '../../integration-platform/scheduling/sync-targets';
import type { SchedulerLog } from '../../integration-platform/scheduling/types';
import { syncEmployees } from '../loopback-client';

export interface EmployeeSyncJobSummary extends Record<string, unknown> {
  connections: number;
  succeeded: number;
  failed: number;
  imported: number;
  reactivated: number;
  deactivated: number;
}

/**
 * In-process equivalent of the Trigger.dev employee sync: syncs the roster
 * from each organization's chosen provider through the API's sync endpoint.
 */
export async function runEmployeeSyncJob(
  log: SchedulerLog,
): Promise<EmployeeSyncJobSummary> {
  const targets = await findEmployeeSyncConnections({ log });
  const summary: EmployeeSyncJobSummary = {
    connections: targets.length,
    succeeded: 0,
    failed: 0,
    imported: 0,
    reactivated: 0,
    deactivated: 0,
  };

  for (const target of targets) {
    try {
      const result = await syncEmployees(target);
      if (result.success === false) {
        throw new Error('sync reported failure');
      }
      summary.succeeded++;
      summary.imported += result.imported ?? 0;
      summary.reactivated += result.reactivated ?? 0;
      summary.deactivated += result.deactivated ?? 0;
      log.info(`Employee sync completed for ${target.providerSlug}`, {
        organizationId: target.organizationId,
        imported: result.imported,
        reactivated: result.reactivated,
        deactivated: result.deactivated,
      });
    } catch (error) {
      summary.failed++;
      log.error(`Employee sync failed for ${target.providerSlug}`, {
        organizationId: target.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
