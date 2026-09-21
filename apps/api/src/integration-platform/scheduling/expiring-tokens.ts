import { db } from '@db';

/** Refresh tokens expiring within the next 24 hours. */
export const TOKEN_REFRESH_LOOKAHEAD_HOURS = 24;

export interface ExpiringTokenConnection {
  id: string;
  organizationId: string;
  organizationName: string | undefined;
  expiresAt: Date;
}

/**
 * Active connections whose LATEST credential version expires within the
 * lookahead window (and has not expired yet). Only the latest version counts:
 * older versions may exist and expire earlier while the current one is fine.
 */
export async function findConnectionsWithExpiringTokens({
  now,
  lookaheadHours = TOKEN_REFRESH_LOOKAHEAD_HOURS,
}: {
  now: Date;
  lookaheadHours?: number;
}): Promise<ExpiringTokenConnection[]> {
  const expiryThreshold = new Date(
    now.getTime() + lookaheadHours * 60 * 60 * 1000,
  );

  const activeConnections = await db.integrationConnection.findMany({
    where: { status: 'active' },
    include: {
      organization: { select: { id: true, name: true } },
      credentialVersions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { expiresAt: true },
      },
    },
  });

  const expiring: ExpiringTokenConnection[] = [];
  for (const connection of activeConnections) {
    const expiresAt = connection.credentialVersions[0]?.expiresAt;
    if (!expiresAt || expiresAt > expiryThreshold || expiresAt <= now) {
      continue;
    }
    expiring.push({
      id: connection.id,
      organizationId: connection.organizationId,
      organizationName: connection.organization?.name,
      expiresAt,
    });
  }
  return expiring;
}
