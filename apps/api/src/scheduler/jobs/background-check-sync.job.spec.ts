import { db } from '@db';
import { runBackgroundCheckSyncJob } from './background-check-sync.job';

jest.mock('@db', () => ({ db: { integrationConnection: { findMany: jest.fn() } } }));

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('runBackgroundCheckSyncJob', () => {
  it('syncs every active Checkr connection in-process and keeps going past a failure', async () => {
    (db.integrationConnection.findMany as jest.Mock).mockResolvedValue([
      { id: 'icn_a', organizationId: 'org_a' },
      { id: 'icn_b', organizationId: 'org_b' },
    ]);
    const sync = jest
      .fn()
      .mockRejectedValueOnce(new Error('Checkr rejected the API key'))
      .mockResolvedValueOnce({ created: 2, updated: 3, activeMembersWithoutCompletedCheck: 1 });

    const summary = await runBackgroundCheckSyncJob({ log, sync });

    expect(db.integrationConnection.findMany).toHaveBeenCalledWith({
      where: { status: 'active', provider: { slug: 'checkr' } },
      select: { id: true, organizationId: true },
    });
    expect(sync).toHaveBeenNthCalledWith(2, { organizationId: 'org_b', connectionId: 'icn_b' });
    expect(summary).toEqual({ connections: 2, succeeded: 1, failed: 1, created: 2, updated: 3 });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
