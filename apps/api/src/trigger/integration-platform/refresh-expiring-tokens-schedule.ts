import { logger, schedules } from '@trigger.dev/sdk';
import {
  findConnectionsWithExpiringTokens,
  TOKEN_REFRESH_LOOKAHEAD_HOURS,
} from '../../integration-platform/scheduling/expiring-tokens';
import { requestValidCredentials } from './ensure-valid-credentials';

/**
 * Daily scheduled task that proactively refreshes OAuth tokens before they
 * expire. Prevents the "OAuth token expired. Please reconnect" error caused by
 * tokens expiring between scheduled check runs.
 *
 * Runs 1 hour before the daily integration checks (05:00 UTC vs 06:00 UTC) so
 * tokens are always fresh when checks execute.
 */
export const refreshExpiringTokensSchedule = schedules.task({
  id: 'refresh-expiring-tokens-schedule',
  cron: '0 5 * * *', // Daily at 05:00 UTC — 1 hour before integration checks
  maxDuration: 60 * 30, // 30 minutes
  run: async (payload) => {
    logger.info('Starting proactive OAuth token refresh', {
      scheduledAt: payload.timestamp,
      lastRun: payload.lastTimestamp,
    });

    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      logger.error('API_URL environment variable is not set — cannot refresh tokens');
      return { refreshed: 0, failed: 0, skipped: 0 };
    }

    // Date.now() (not `new Date()`) so tests can pin the clock.
    const expiringConnections = await findConnectionsWithExpiringTokens({
      now: new Date(Date.now()),
    });
    logger.info(`Found ${expiringConnections.length} connections with tokens expiring within ${TOKEN_REFRESH_LOOKAHEAD_HOURS}h`);

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (const connection of expiringConnections) {
      const minutesUntilExpiry = Math.round(
        (connection.expiresAt.getTime() - Date.now()) / 60_000,
      );

      logger.info(`Refreshing token for connection ${connection.id}`, {
        organizationId: connection.organizationId,
        organizationName: connection.organizationName,
        minutesUntilExpiry,
      });

      const result = await requestValidCredentials({
        apiUrl,
        connectionId: connection.id,
        organizationId: connection.organizationId,
        forceRefresh: true,
      });

      if (result.success) {
        refreshed++;
        logger.info(`Successfully refreshed token for connection ${connection.id}`);
      } else {
        failed++;
        logger.warn(`Failed to refresh token for connection ${connection.id}`, {
          error: result.error,
          status: result.status,
        });
      }
    }

    logger.info('Proactive OAuth token refresh complete', {
      total: expiringConnections.length,
      refreshed,
      failed,
      skipped,
    });

    return { refreshed, failed, skipped, total: expiringConnections.length };
  },
});
