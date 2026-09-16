const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
jest.mock('@db', () => ({
  db: {
    ssoProvider: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

const mockRegister = jest.fn();
const mockRequestDomainVerification = jest.fn();
const mockVerifyDomain = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('./sso-discovery', () => ({ discoverOidcEndpoints: jest.fn() }));

jest.mock('../auth/auth.server', () => ({
  auth: {
    api: {
      registerSSOProvider: (...args: unknown[]) => mockRegister(...args),
      requestDomainVerification: (...args: unknown[]) =>
        mockRequestDomainVerification(...args),
      verifyDomain: (...args: unknown[]) => mockVerifyDomain(...args),
      updateSSOProvider: (...args: unknown[]) => mockUpdate(...args),
      deleteSSOProvider: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { SsoService } from './sso.service';

const ORG = 'org_acme';
const headers = new Headers({ cookie: 'session=abc' });

const acmeRow = {
  id: 'sso_1',
  providerId: 'acme',
  issuer: 'https://login.acme.com',
  domain: 'acme.com',
  domainVerified: false,
  oidcConfig: JSON.stringify({
    clientId: 'cid',
    clientSecret: 'shh',
    scopes: ['openid'],
    pkce: true,
  }),
  samlConfig: null,
  userId: 'usr_1',
  organizationId: ORG,
  createdAt: new Date('2026-09-15T00:00:00.000Z'),
  updatedAt: new Date('2026-09-15T00:00:00.000Z'),
};

describe('SsoService lifecycle', () => {
  const service = new SsoService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_URL = 'https://api.trycomp.ai';
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(acmeRow);
  });

  describe('domain verification', () => {
    it('returns the pending TXT record', async () => {
      mockRequestDomainVerification.mockResolvedValue({
        domainVerificationToken: 'tok',
      });

      await expect(
        service.getDomainVerification({
          organizationId: ORG,
          headers,
          providerId: 'acme',
        }),
      ).resolves.toEqual({
        recordType: 'TXT',
        recordName: '_compai-sso-acme',
        recordValue: 'tok',
      });
    });

    it('conflicts once the domain is verified', async () => {
      mockFindFirst.mockResolvedValue({ ...acmeRow, domainVerified: true });

      await expect(
        service.getDomainVerification({
          organizationId: ORG,
          headers,
          providerId: 'acme',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockRequestDomainVerification).not.toHaveBeenCalled();
    });

    it('verifies through better-auth and returns the refreshed provider', async () => {
      mockVerifyDomain.mockResolvedValue(undefined);
      mockFindFirst
        .mockResolvedValueOnce(acmeRow)
        .mockResolvedValueOnce({ ...acmeRow, domainVerified: true });

      const result = await service.verifyDomain({
        organizationId: ORG,
        headers,
        providerId: 'acme',
      });

      expect(mockVerifyDomain).toHaveBeenCalledWith({
        headers,
        body: { providerId: 'acme' },
      });
      expect(result.domainVerified).toBe(true);
    });
  });

  describe('updateProvider', () => {
    it('rejects an empty update before touching better-auth', async () => {
      await expect(
        service.updateProvider({
          organizationId: ORG,
          headers,
          providerId: 'acme',
          dto: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('forwards only the supplied OIDC fields', async () => {
      mockUpdate.mockResolvedValue({});

      await service.updateProvider({
        organizationId: ORG,
        headers,
        providerId: 'acme',
        dto: { clientSecret: 'rotated', pkce: false },
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        headers,
        body: {
          providerId: 'acme',
          issuer: undefined,
          domain: undefined,
          oidcConfig: { clientSecret: 'rotated', pkce: false },
        },
      });
    });

    it('checks a new domain against other providers but not itself', async () => {
      mockUpdate.mockResolvedValue({});
      mockFindMany.mockResolvedValue([]);

      await service.updateProvider({
        organizationId: ORG,
        headers,
        providerId: 'acme',
        dto: { domain: 'ACME.io' },
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { providerId: { not: 'acme' } },
        select: { domain: true },
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        headers,
        body: {
          providerId: 'acme',
          issuer: undefined,
          domain: 'acme.io',
          oidcConfig: undefined,
        },
      });
    });
  });

  describe('deleteProvider', () => {
    it('delegates to better-auth after the tenant check', async () => {
      mockDelete.mockResolvedValue({ success: true });

      await expect(
        service.deleteProvider({
          organizationId: ORG,
          headers,
          providerId: 'acme',
        }),
      ).resolves.toEqual({ success: true });
      expect(mockDelete).toHaveBeenCalledWith({
        headers,
        body: { providerId: 'acme' },
      });
    });
  });
});
