jest.mock('@db', () => ({ db: {} }));
// The guards pull in ./auth.server (better-auth, Redis) at import time; stub
// them — the controller is exercised directly, guards never run here.
jest.mock('../auth/hybrid-auth.guard', () => ({ HybridAuthGuard: class {} }));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class {},
  PERMISSIONS_KEY: 'permissions',
}));
jest.mock('../auth/session-only.guard', () => ({ SessionOnlyGuard: class {} }));
jest.mock('./sso.service', () => ({ SsoService: class {} }));

import type { Request } from 'express';
import { SsoController } from './sso.controller';
import type { SsoService } from './sso.service';

const ORG = 'org_acme';

function makeRequest(): Request {
  return {
    headers: { cookie: 'session=abc', 'x-api-key': 'nope' },
  } as unknown as Request;
}

describe('SsoController', () => {
  const service = {
    listProviders: jest.fn(),
    createProvider: jest.fn(),
    getDomainVerification: jest.fn(),
    verifyDomain: jest.fn(),
    updateProvider: jest.fn(),
    deleteProvider: jest.fn(),
  };
  const controller = new SsoController(service as unknown as SsoService);

  beforeEach(() => jest.clearAllMocks());

  it('wraps the provider list in the standard list envelope', async () => {
    service.listProviders.mockResolvedValue([{ providerId: 'acme' }]);

    await expect(controller.listProviders(ORG)).resolves.toEqual({
      data: [{ providerId: 'acme' }],
      count: 1,
    });
    expect(service.listProviders).toHaveBeenCalledWith(ORG);
  });

  it('forwards only session credentials to the service on create', async () => {
    service.createProvider.mockResolvedValue({ providerId: 'acme' });
    const dto = {
      providerId: 'acme',
      issuer: 'https://login.acme.com',
      domain: 'acme.com',
      clientId: 'cid',
      clientSecret: 'shh',
    };

    await controller.createProvider(ORG, makeRequest(), dto);

    const call = service.createProvider.mock.calls[0][0];
    expect(call.organizationId).toBe(ORG);
    expect(call.dto).toBe(dto);
    expect(call.headers.get('cookie')).toBe('session=abc');
    expect(call.headers.get('x-api-key')).toBeNull();
  });

  it('passes the route provider id through for verification, update and delete', async () => {
    service.getDomainVerification.mockResolvedValue({});
    service.verifyDomain.mockResolvedValue({});
    service.updateProvider.mockResolvedValue({});
    service.deleteProvider.mockResolvedValue({ success: true });
    const req = makeRequest();

    await controller.getDomainVerification(ORG, req, 'acme');
    await controller.verifyDomain(ORG, req, 'acme');
    await controller.updateProvider(ORG, req, 'acme', { pkce: false });
    await controller.deleteProvider(ORG, req, 'acme');

    expect(service.getDomainVerification).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, providerId: 'acme' }),
    );
    expect(service.verifyDomain).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, providerId: 'acme' }),
    );
    expect(service.updateProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        providerId: 'acme',
        dto: { pkce: false },
      }),
    );
    expect(service.deleteProvider).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, providerId: 'acme' }),
    );
  });
});
