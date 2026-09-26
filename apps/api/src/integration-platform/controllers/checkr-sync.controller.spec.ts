import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ActingUserResolver } from '../../auth/acting-user.service';
import { PERMISSIONS_KEY } from '../../auth/permission.guard';
import type { AuthenticatedRequest } from '../../auth/types';
import type { CheckrBackgroundCheckSyncService } from '../checkr/checkr-background-check-sync.service';
import { CheckrSyncController } from './checkr-sync.controller';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('../checkr/checkr-background-check-sync.service', () => ({
  CheckrBackgroundCheckSyncService: class {},
}));

describe('CheckrSyncController', () => {
  const sync = jest.fn();
  const resolve = jest.fn();
  const controller = new CheckrSyncController(
    { sync } as unknown as CheckrBackgroundCheckSyncService,
    { resolve } as unknown as ActingUserResolver,
  );
  const req = {} as AuthenticatedRequest;

  beforeEach(() => jest.clearAllMocks());

  it('syncs the given connection for the caller organization as the acting user', async () => {
    resolve.mockResolvedValue({ userId: 'usr_1', memberId: 'mem_1', source: 'session' });
    sync.mockResolvedValue({ success: true });

    await controller.syncCheckrBackgroundChecks('org_1', 'icn_1', req);

    expect(resolve).toHaveBeenCalledWith(req, 'org_1');
    expect(sync).toHaveBeenCalledWith({
      organizationId: 'org_1',
      connectionId: 'icn_1',
      actor: { userId: 'usr_1', memberId: 'mem_1' },
    });
  });

  it('syncs without an actor when none can be resolved', async () => {
    resolve.mockResolvedValue({ userId: null, memberId: null, source: 'none' });
    await controller.syncCheckrBackgroundChecks('org_1', 'icn_1', req);
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ actor: null }));
  });

  it('requires a connection id', async () => {
    await expect(controller.syncCheckrBackgroundChecks('org_1', '', req)).rejects.toThrow(BadRequestException);
    expect(sync).not.toHaveBeenCalled();
  });

  it('requires member:update as well as integration:update, since it writes background checks', () => {
    expect(
      new Reflector().get(PERMISSIONS_KEY, CheckrSyncController.prototype.syncCheckrBackgroundChecks),
    ).toEqual([
      { resource: 'integration', actions: ['update'] },
      { resource: 'member', actions: ['update'] },
    ]);
  });
});
