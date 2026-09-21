jest.mock('../../integration-platform/scheduling/sync-targets', () => ({
  findEmployeeSyncConnections: jest.fn(),
}));
jest.mock('../loopback-client', () => ({ syncEmployees: jest.fn() }));

import { findEmployeeSyncConnections } from '../../integration-platform/scheduling/sync-targets';
import { syncEmployees } from '../loopback-client';
import { runEmployeeSyncJob } from './employee-sync.job';

const findMock = findEmployeeSyncConnections as jest.Mock;
const syncMock = syncEmployees as jest.Mock;
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('runEmployeeSyncJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('syncs each configured provider and totals the results', async () => {
    const target = {
      connectionId: 'c1',
      organizationId: 'org_1',
      organizationName: 'Acme',
      providerSlug: 'google-workspace',
    };
    findMock.mockResolvedValue([
      target,
      { ...target, connectionId: 'c2', organizationId: 'org_2' },
    ]);
    syncMock
      .mockResolvedValueOnce({
        success: true,
        imported: 2,
        reactivated: 1,
        deactivated: 0,
      })
      .mockRejectedValueOnce(new Error('401'));

    await expect(runEmployeeSyncJob(log)).resolves.toEqual({
      connections: 2,
      succeeded: 1,
      failed: 1,
      imported: 2,
      reactivated: 1,
      deactivated: 0,
    });
    expect(syncMock).toHaveBeenCalledWith(target);
  });
});
