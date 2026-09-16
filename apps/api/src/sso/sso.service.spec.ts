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
const mockDiscover = jest.fn();
jest.mock('./sso-discovery', () => ({
  discoverOidcEndpoints: (...args: unknown[]) => mockDiscover(...args),
}));

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

import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
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

const discoveredEndpoints = {
  discoveryEndpoint: 'https://login.acme.com/.well-known/openid-configuration',
  authorizationEndpoint: 'https://login.acme.com/authorize',
  tokenEndpoint: 'https://login.acme.com/token',
  jwksEndpoint: 'https://login.acme.com/jwks',
  userInfoEndpoint: 'https://login.acme.com/userinfo',
  tokenEndpointAuthentication: 'client_secret_basic' as const,
};

const createDto = {
  providerId: 'acme',
  issuer: 'https://login.acme.com',
  domain: 'Acme.com',
  clientId: 'cid',
  clientSecret: 'shh',
};

describe('SsoService', () => {
  const service = new SsoService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_URL = 'https://api.trycomp.ai';
    mockFindMany.mockResolvedValue([]);
    mockFindFirst.mockResolvedValue(acmeRow);
    mockDiscover.mockResolvedValue(discoveredEndpoints);
  });

  describe('listProviders', () => {
    it('is scoped to the organization and strips secrets', async () => {
      mockFindMany.mockResolvedValue([acmeRow]);

      const result = await service.listProviders(ORG);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { organizationId: ORG },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].providerId).toBe('acme');
      expect(result[0].redirectUri).toBe(
        'https://api.trycomp.ai/api/auth/sso/callback/acme',
      );
      expect(JSON.stringify(result)).not.toContain('shh');
    });
  });

  describe('createProvider', () => {
    it('registers through better-auth with the org, normalised domain and safe defaults', async () => {
      mockRegister.mockResolvedValue({ domainVerificationToken: 'tok' });

      const result = await service.createProvider({
        organizationId: ORG,
        headers,
        dto: createDto,
      });

      expect(mockRegister).toHaveBeenCalledWith({
        headers,
        body: {
          providerId: 'acme',
          issuer: 'https://login.acme.com',
          domain: 'acme.com',
          organizationId: ORG,
          oidcConfig: {
            clientId: 'cid',
            clientSecret: 'shh',
            skipDiscovery: true,
            ...discoveredEndpoints,
            scopes: ['openid', 'profile', 'email'],
            pkce: true,
          },
        },
      });
      expect(result.domainVerification).toEqual({
        recordType: 'TXT',
        recordName: '_compai-sso-acme',
        recordValue: 'tok',
      });
      expect(result.domainVerified).toBe(false);
    });

    it('discovers the provider endpoints itself so public IdPs need no trusted-origins entry', async () => {
      mockRegister.mockResolvedValue({ domainVerificationToken: 'tok' });

      await service.createProvider({
        organizationId: ORG,
        headers,
        dto: createDto,
      });

      expect(mockDiscover).toHaveBeenCalledWith({
        issuer: 'https://login.acme.com',
        discoveryEndpoint: undefined,
      });
    });

    it('does not register anything when discovery fails', async () => {
      mockDiscover.mockRejectedValue(
        new BadRequestException('OpenID Connect discovery failed'),
      );

      await expect(
        service.createProvider({
          organizationId: ORG,
          headers,
          dto: createDto,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('refuses a domain (or subdomain) already registered by another provider', async () => {
      mockFindMany.mockResolvedValue([{ domain: 'other.com,acme.com' }]);

      await expect(
        service.createProvider({
          organizationId: ORG,
          headers,
          dto: createDto,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      mockFindMany.mockResolvedValue([{ domain: 'corp.acme.com' }]);
      await expect(
        service.createProvider({
          organizationId: ORG,
          headers,
          dto: createDto,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('surfaces better-auth failures with their own status', async () => {
      mockRegister.mockRejectedValue({
        statusCode: 422,
        message: 'SSO provider with this providerId already exists',
        body: { message: 'SSO provider with this providerId already exists' },
      });

      const failing = service.createProvider({
        organizationId: ORG,
        headers,
        dto: createDto,
      });
      await expect(failing).rejects.toBeInstanceOf(HttpException);
      await expect(failing).rejects.toMatchObject({ status: 422 });
    });

    it('requests a verification record when registration did not return one', async () => {
      mockRegister.mockResolvedValue({});
      mockRequestDomainVerification.mockResolvedValue({
        domainVerificationToken: 'fresh',
      });

      const result = await service.createProvider({
        organizationId: ORG,
        headers,
        dto: createDto,
      });

      expect(mockRequestDomainVerification).toHaveBeenCalledWith({
        headers,
        body: { providerId: 'acme' },
      });
      expect(result.domainVerification.recordValue).toBe('fresh');
    });
  });

  describe('tenant isolation', () => {
    it('returns 404 for a provider that belongs to another organization', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        service.deleteProvider({
          organizationId: 'org_other',
          headers,
          providerId: 'acme',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { providerId: 'acme', organizationId: 'org_other' },
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
