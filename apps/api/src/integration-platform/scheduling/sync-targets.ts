import { getManifest } from '@trycompai/integration-platform';
import { db } from '@db';
import type { SchedulerLog } from './types';

export interface SyncTarget {
  connectionId: string;
  organizationId: string;
  organizationName: string;
  providerSlug: string;
}

/**
 * The active connection behind each organization's chosen employee sync
 * provider, limited to providers whose manifest supports `sync`.
 */
export async function findEmployeeSyncConnections({
  log,
}: {
  log: SchedulerLog;
}): Promise<SyncTarget[]> {
  const orgsWithSyncProvider = await db.organization.findMany({
    where: { employeeSyncProvider: { not: null } },
    select: { id: true, name: true, employeeSyncProvider: true },
  });

  const targets: SyncTarget[] = [];
  for (const org of orgsWithSyncProvider) {
    if (!org.employeeSyncProvider) continue;
    const connection = await db.integrationConnection.findFirst({
      where: {
        organizationId: org.id,
        status: 'active',
        provider: { slug: org.employeeSyncProvider },
      },
      select: { id: true, provider: { select: { slug: true } } },
    });
    if (!connection) {
      log.warn(
        `Organization ${org.name} has sync provider ${org.employeeSyncProvider} but no active connection`,
      );
      continue;
    }
    if (
      !getManifest(connection.provider.slug)?.capabilities?.includes('sync')
    ) {
      continue;
    }
    targets.push({
      connectionId: connection.id,
      organizationId: org.id,
      organizationName: org.name,
      providerSlug: connection.provider.slug,
    });
  }
  return targets;
}

/** The active connection behind each organization's chosen device sync provider. */
export async function findDeviceSyncTargets({
  log,
}: {
  log: SchedulerLog;
}): Promise<SyncTarget[]> {
  const orgsWithDeviceSync = await db.organization.findMany({
    where: { deviceSyncProvider: { not: null } },
    select: { id: true, name: true, deviceSyncProvider: true },
  });

  const targets: SyncTarget[] = [];
  for (const org of orgsWithDeviceSync) {
    if (!org.deviceSyncProvider) continue;
    const connection = await db.integrationConnection.findFirst({
      where: {
        organizationId: org.id,
        status: 'active',
        provider: { slug: org.deviceSyncProvider },
      },
      select: { id: true },
    });
    if (!connection) {
      log.warn(
        `No active connection for device sync provider ${org.deviceSyncProvider} in org ${org.id}`,
      );
      continue;
    }
    targets.push({
      connectionId: connection.id,
      organizationId: org.id,
      organizationName: org.name,
      providerSlug: org.deviceSyncProvider,
    });
  }
  return targets;
}
