jest.mock('@db', () => ({
  db: { integrationConnection: { findMany: jest.fn() } },
}));

import { db } from '@db';
import { findConnectionsWithExpiringTokens } from './expiring-tokens';

const findMany = (
  db as unknown as { integrationConnection: { findMany: jest.Mock } }
).integrationConnection.findMany;

describe('findConnectionsWithExpiringTokens', () => {
  const now = new Date('2026-09-21T00:00:00.000Z');

  it('keeps only connections whose latest version expires inside the window', async () => {
    findMany.mockResolvedValue([
      {
        id: 'soon',
        organizationId: 'org_1',
        organization: { name: 'Acme' },
        credentialVersions: [
          { expiresAt: new Date('2026-09-21T12:00:00.000Z') },
        ],
      },
      {
        id: 'later',
        organizationId: 'org_1',
        organization: { name: 'Acme' },
        credentialVersions: [
          { expiresAt: new Date('2026-09-23T00:00:00.000Z') },
        ],
      },
      {
        id: 'expired',
        organizationId: 'org_1',
        organization: { name: 'Acme' },
        credentialVersions: [
          { expiresAt: new Date('2026-09-20T00:00:00.000Z') },
        ],
      },
      {
        id: 'no-expiry',
        organizationId: 'org_1',
        organization: null,
        credentialVersions: [],
      },
    ]);

    await expect(findConnectionsWithExpiringTokens({ now })).resolves.toEqual([
      {
        id: 'soon',
        organizationId: 'org_1',
        organizationName: 'Acme',
        expiresAt: new Date('2026-09-21T12:00:00.000Z'),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active' } }),
    );
  });
});
