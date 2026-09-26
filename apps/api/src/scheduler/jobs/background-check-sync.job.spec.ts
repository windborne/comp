import { db } from '@db';
import { syncCheckrBackgroundChecks } from '../loopback-client';
import { runBackgroundCheckSyncJob } from './background-check-sync.job';

jest.mock('@db', () => ({ db: { integrationConnection: { findMany: jest.fn() } } }));
jest.mock('../loopback-client', () => ({ syncCheckrBackgroundChecks: jest.fn() }));

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('runBackgroundCheckSyncJob', () => {
  it('syncs every active Checkr connection and keeps going past a failure', async () => {
    (db.integrationConnection.findMany as jest.Mock).mockResolvedValue([
      { id: 'icn_a', organizationId: 'org_a' },
      { id: 'icn_b', organizationId: 'org_b' },
    ]);
    (syncCheckrBackgroundChecks as jest.Mock)
      .mockRejectedValueOnce(new Error('Checkr rejected the API key'))
      .mockResolvedValueOnce({ success: true, created: 2, updated: 3 });

    const summary = await runBackgroundCheckSyncJob(log);

    expect(db.integrationConnection.findMany).toHaveBeenCalledWith({
      where: { status: 'active', provider: { slug: 'checkr' } },
      select: { id: true, organizationId: true },
    });
    expect(summary).toEqual({ connections: 2, succeeded: 1, failed: 1, created: 2, updated: 3 });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
