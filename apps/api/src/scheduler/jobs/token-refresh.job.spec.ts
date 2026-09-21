jest.mock('../../integration-platform/scheduling/expiring-tokens', () => ({
  findConnectionsWithExpiringTokens: jest.fn(),
}));
jest.mock('../loopback-client', () => ({ ensureValidCredentials: jest.fn() }));

import { findConnectionsWithExpiringTokens } from '../../integration-platform/scheduling/expiring-tokens';
import { ensureValidCredentials } from '../loopback-client';
import { runTokenRefreshJob } from './token-refresh.job';

const findMock = findConnectionsWithExpiringTokens as jest.Mock;
const refreshMock = ensureValidCredentials as jest.Mock;
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('runTokenRefreshJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('force-refreshes each expiring connection and counts failures', async () => {
    findMock.mockResolvedValue([
      { id: 'c1', organizationId: 'org_1', expiresAt: new Date() },
      { id: 'c2', organizationId: 'org_1', expiresAt: new Date() },
    ]);
    refreshMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'revoked' });

    await expect(runTokenRefreshJob(log)).resolves.toEqual({
      expiring: 2,
      refreshed: 1,
      failed: 1,
    });
    expect(refreshMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      connectionId: 'c1',
      forceRefresh: true,
    });
  });
});
