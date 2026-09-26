import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../auth/permission.guard';
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
  const controller = new CheckrSyncController({ sync } as unknown as CheckrBackgroundCheckSyncService);

  it('syncs the given connection for the caller organization', async () => {
    sync.mockResolvedValue({ success: true });
    await controller.syncCheckrBackgroundChecks('org_1', 'icn_1');
    expect(sync).toHaveBeenCalledWith({ organizationId: 'org_1', connectionId: 'icn_1' });
  });

  it('requires a connection id', async () => {
    await expect(controller.syncCheckrBackgroundChecks('org_1', '')).rejects.toThrow(BadRequestException);
  });

  it('requires integration:update like the other sync endpoints', () => {
    expect(
      new Reflector().get(PERMISSIONS_KEY, CheckrSyncController.prototype.syncCheckrBackgroundChecks),
    ).toEqual([{ resource: 'integration', actions: ['update'] }]);
  });
});
