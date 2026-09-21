jest.mock('@db', () => ({
  db: {
    organization: { findMany: jest.fn() },
    integrationConnection: { findFirst: jest.fn() },
  },
}));
jest.mock('@trycompai/integration-platform', () => ({
  getManifest: jest.fn(),
}));

import { db } from '@db';
import { getManifest } from '@trycompai/integration-platform';
import {
  findDeviceSyncTargets,
  findEmployeeSyncConnections,
} from './sync-targets';

const mockedDb = db as unknown as {
  organization: { findMany: jest.Mock };
  integrationConnection: { findFirst: jest.Mock };
};
const manifestMock = getManifest as jest.Mock;
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('findEmployeeSyncConnections', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the active connection for each org whose provider supports sync', async () => {
    mockedDb.organization.findMany.mockResolvedValue([
      { id: 'org_1', name: 'Acme', employeeSyncProvider: 'google-workspace' },
      { id: 'org_2', name: 'NoConn', employeeSyncProvider: 'rippling' },
      { id: 'org_3', name: 'NoSync', employeeSyncProvider: 'github' },
    ]);
    mockedDb.integrationConnection.findFirst
      .mockResolvedValueOnce({
        id: 'c1',
        provider: { slug: 'google-workspace' },
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'c3', provider: { slug: 'github' } });
    manifestMock.mockImplementation((slug: string) =>
      slug === 'google-workspace'
        ? { capabilities: ['sync'] }
        : { capabilities: [] },
    );

    await expect(findEmployeeSyncConnections({ log })).resolves.toEqual([
      {
        connectionId: 'c1',
        organizationId: 'org_1',
        organizationName: 'Acme',
        providerSlug: 'google-workspace',
      },
    ]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('NoConn'));
  });
});

describe('findDeviceSyncTargets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips orgs without an active connection for their device provider', async () => {
    mockedDb.organization.findMany.mockResolvedValue([
      { id: 'org_1', name: 'A', deviceSyncProvider: 'kandji' },
      { id: 'org_2', name: 'B', deviceSyncProvider: 'kandji' },
    ]);
    mockedDb.integrationConnection.findFirst
      .mockResolvedValueOnce({ id: 'c1' })
      .mockResolvedValueOnce(null);

    await expect(findDeviceSyncTargets({ log })).resolves.toEqual([
      {
        connectionId: 'c1',
        organizationId: 'org_1',
        organizationName: 'A',
        providerSlug: 'kandji',
      },
    ]);
  });
});
