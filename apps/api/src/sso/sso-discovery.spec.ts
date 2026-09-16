// @better-auth/sso is ESM-only; stub the two exports this module uses.
jest.mock('@better-auth/sso', () => ({
  discoverOIDCConfig: jest.fn(),
  DiscoveryError: class DiscoveryError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { DiscoveryError } from '@better-auth/sso';
import {
  assertHostResolvesPublic,
  discoverOidcEndpoints,
  isAllowedIdpUrl,
  isPublicHost,
  isPublicIpAddress,
} from './sso-discovery';

const publicResolver = () => Promise.resolve([{ address: '203.0.113.10' }]);

describe('isPublicIpAddress', () => {
  it('rejects loopback, private, link-local, CGNAT and multicast ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      'fd12::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPublicIpAddress(ip)).toBe(false);
    }
  });

  it('accepts globally routable addresses', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('172.32.0.1')).toBe(true);
    expect(isPublicIpAddress('2606:4700::1111')).toBe(true);
    expect(isPublicIpAddress('not-an-ip')).toBe(false);
  });
});

describe('isPublicHost', () => {
  it('rejects names that only exist on private networks', () => {
    for (const host of [
      'localhost',
      'idp.localhost',
      'keycloak.local',
      'sso.internal',
      'idp',
    ]) {
      expect(isPublicHost(host)).toBe(false);
    }
  });

  it('accepts public hostnames and public IP literals', () => {
    expect(isPublicHost('api-gw.uid.alpha.ui.com')).toBe(true);
    expect(isPublicHost('accounts.google.com')).toBe(true);
    expect(isPublicHost('203.0.113.10')).toBe(true);
    expect(isPublicHost('10.0.0.5')).toBe(false);
  });
});

describe('isAllowedIdpUrl', () => {
  it('trusts any public https identity provider without configuration', () => {
    expect(
      isAllowedIdpUrl(
        'https://api-gw.uid.alpha.ui.com/idp/api/v1/public/oauth/abc/.well-known/openid-configuration',
      ),
    ).toBe(true);
    expect(
      isAllowedIdpUrl('https://login.microsoftonline.com/tenant/v2.0'),
    ).toBe(true);
  });

  it('refuses plain http, private hosts and garbage', () => {
    expect(isAllowedIdpUrl('http://accounts.google.com')).toBe(false);
    expect(isAllowedIdpUrl('https://keycloak.internal/realms/x')).toBe(false);
    expect(isAllowedIdpUrl('https://10.0.0.5/realms/x')).toBe(false);
    expect(isAllowedIdpUrl('nope')).toBe(false);
  });

  it('keeps AUTH_TRUSTED_ORIGINS as the escape hatch for internal providers', () => {
    const previous = process.env.AUTH_TRUSTED_ORIGINS;
    process.env.AUTH_TRUSTED_ORIGINS =
      'https://app.example.com,http://keycloak.internal:8080';
    try {
      expect(isAllowedIdpUrl('http://keycloak.internal:8080/realms/x')).toBe(
        true,
      );
    } finally {
      process.env.AUTH_TRUSTED_ORIGINS = previous;
    }
  });
});

describe('assertHostResolvesPublic', () => {
  it('passes when every resolved address is public', async () => {
    await expect(
      assertHostResolvesPublic({
        url: 'https://idp.example.com',
        resolveHost: publicResolver,
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a public-looking name that resolves to a private address', async () => {
    await expect(
      assertHostResolvesPublic({
        url: 'https://idp.example.com',
        resolveHost: () =>
          Promise.resolve([
            { address: '203.0.113.10' },
            { address: '10.0.0.5' },
          ]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports unresolvable hosts as a client error', async () => {
    await expect(
      assertHostResolvesPublic({
        url: 'https://idp.example.com',
        resolveHost: () => Promise.reject(new Error('ENOTFOUND')),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('discoverOidcEndpoints', () => {
  const issuer = 'https://api-gw.uid.alpha.ui.com/idp/api/v1/public/oauth/abc';
  const hydrated = {
    issuer,
    discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    jwksEndpoint: `${issuer}/jwks`,
    userInfoEndpoint: `${issuer}/userinfo`,
    tokenEndpointAuthentication: 'client_secret_post' as const,
    scopesSupported: ['openid'],
  };

  it('runs the plugin discovery with the Comp AI trust rule and returns the endpoints', async () => {
    const discover = jest.fn().mockResolvedValue(hydrated);

    const result = await discoverOidcEndpoints({
      issuer,
      discover,
      resolveHost: publicResolver,
    });

    expect(discover).toHaveBeenCalledWith({
      issuer,
      discoveryEndpoint: undefined,
      isTrustedOrigin: isAllowedIdpUrl,
    });
    expect(result).toEqual({
      discoveryEndpoint: hydrated.discoveryEndpoint,
      authorizationEndpoint: hydrated.authorizationEndpoint,
      tokenEndpoint: hydrated.tokenEndpoint,
      jwksEndpoint: hydrated.jwksEndpoint,
      userInfoEndpoint: hydrated.userInfoEndpoint,
      tokenEndpointAuthentication: 'client_secret_post',
    });
  });

  it('rejects a private issuer before touching the network', async () => {
    const discover = jest.fn();

    await expect(
      discoverOidcEndpoints({
        issuer: 'https://keycloak.internal/realms/x',
        discover,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(discover).not.toHaveBeenCalled();
  });

  it('maps discovery failures to client errors and unreachable providers to 502', async () => {
    const mismatch = jest
      .fn()
      .mockRejectedValue(
        new DiscoveryError('issuer_mismatch', 'Discovered issuer differs'),
      );
    await expect(
      discoverOidcEndpoints({
        issuer,
        discover: mismatch,
        resolveHost: publicResolver,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const timeout = jest
      .fn()
      .mockRejectedValue(new DiscoveryError('discovery_timeout', 'timed out'));
    await expect(
      discoverOidcEndpoints({
        issuer,
        discover: timeout,
        resolveHost: publicResolver,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
