import { findConnectionsWithExpiringTokens } from '../../integration-platform/scheduling/expiring-tokens';
import type { SchedulerLog } from '../../integration-platform/scheduling/types';
import { ensureValidCredentials } from '../loopback-client';

export interface TokenRefreshJobSummary extends Record<string, unknown> {
  expiring: number;
  refreshed: number;
  failed: number;
}

/**
 * In-process equivalent of the Trigger.dev token refresh: forces a refresh of
 * every OAuth token that expires within the next day, one hour before the
 * checks that would otherwise hit "token expired".
 */
export async function runTokenRefreshJob(
  log: SchedulerLog,
): Promise<TokenRefreshJobSummary> {
  const expiring = await findConnectionsWithExpiringTokens({
    now: new Date(Date.now()),
  });
  const summary: TokenRefreshJobSummary = {
    expiring: expiring.length,
    refreshed: 0,
    failed: 0,
  };

  for (const connection of expiring) {
    try {
      const result = await ensureValidCredentials({
        organizationId: connection.organizationId,
        connectionId: connection.id,
        forceRefresh: true,
      });
      if (result.success === false) {
        throw new Error(result.error ?? 'refresh reported failure');
      }
      summary.refreshed++;
    } catch (error) {
      summary.failed++;
      log.warn(`Failed to refresh token for connection ${connection.id}`, {
        organizationId: connection.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
