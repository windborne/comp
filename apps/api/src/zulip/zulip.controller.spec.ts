jest.mock('@db', () => ({ db: {} }));
// The guards pull in ./auth.server (better-auth, Redis) at import time; stub
// them — the controller is exercised directly, guards never run here.
jest.mock('../auth/hybrid-auth.guard', () => ({ HybridAuthGuard: class {} }));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class {},
  PERMISSIONS_KEY: 'permissions',
}));
jest.mock('./zulip.service', () => ({ ZulipService: class {} }));

import { BadRequestException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import { ZulipController } from './zulip.controller';

const ORG = 'org_acme';

function makeAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    organizationId: ORG,
    authType: 'session',
    isApiKey: false,
    isPlatformAdmin: false,
    userEmail: 'chris@example.com',
    userRoles: ['admin'],
    ...overrides,
  };
}

describe('ZulipController', () => {
  const service = {
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
    removeSettings: jest.fn(),
    sendTestMessage: jest.fn(),
  };
  const controller = new ZulipController(service);

  beforeEach(() => jest.clearAllMocks());

  it('returns the settings view for the organization', async () => {
    service.getSettings.mockResolvedValue({ configured: false });

    await expect(controller.getSettings(ORG)).resolves.toEqual({
      configured: false,
    });
    expect(service.getSettings).toHaveBeenCalledWith(ORG);
  });

  it('forwards the upsert body scoped to the organization', async () => {
    const dto = {
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
    };
    service.upsertSettings.mockResolvedValue({ configured: true });

    await controller.upsertSettings(ORG, dto);

    expect(service.upsertSettings).toHaveBeenCalledWith({
      organizationId: ORG,
      dto,
    });
  });

  it('removes the connection', async () => {
    service.removeSettings.mockResolvedValue({ success: true });

    await expect(controller.removeSettings(ORG)).resolves.toEqual({
      success: true,
    });
    expect(service.removeSettings).toHaveBeenCalledWith(ORG);
  });

  it('sends the test message to the signed-in user', async () => {
    service.sendTestMessage.mockResolvedValue({ sent: true, messageId: 1 });

    await controller.sendTestMessage(ORG, makeAuthContext());

    expect(service.sendTestMessage).toHaveBeenCalledWith({
      organizationId: ORG,
      email: 'chris@example.com',
    });
  });

  it('rejects test messages from API-key callers with no user email', async () => {
    await expect(
      controller.sendTestMessage(
        ORG,
        makeAuthContext({
          authType: 'api-key',
          isApiKey: true,
          userEmail: undefined,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.sendTestMessage).not.toHaveBeenCalled();
  });
});
