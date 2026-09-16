import { BadRequestException } from '@nestjs/common';
import {
  buildDomainVerification,
  normalizeDomainList,
  parseStoredOidcConfig,
  toPublicSsoProvider,
} from './sso-provider.mapper';

const row = {
  id: 'sso_1',
  providerId: 'acme',
  issuer: 'https://login.acme.com',
  domain: 'acme.com',
  domainVerified: false,
  oidcConfig: JSON.stringify({
    clientId: 'client-123',
    clientSecret: 'super-secret',
    scopes: ['openid', 'email'],
    pkce: false,
    discoveryEndpoint:
      'https://login.acme.com/.well-known/openid-configuration',
  }),
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  updatedAt: new Date('2026-09-15T11:00:00.000Z'),
};

describe('toPublicSsoProvider', () => {
  it('exposes the public config, the callback URI, and never the client secret', () => {
    const result = toPublicSsoProvider(row, 'https://api.trycomp.ai');

    expect(result).toEqual({
      id: 'sso_1',
      providerId: 'acme',
      issuer: 'https://login.acme.com',
      domain: 'acme.com',
      domainVerified: false,
      clientId: 'client-123',
      scopes: ['openid', 'email'],
      pkce: false,
      discoveryEndpoint:
        'https://login.acme.com/.well-known/openid-configuration',
      redirectUri: 'https://api.trycomp.ai/api/auth/sso/callback/acme',
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-15T11:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });

  it('degrades gracefully when the stored config is missing or corrupt', () => {
    expect(parseStoredOidcConfig(null)).toEqual({});
    expect(parseStoredOidcConfig('not json')).toEqual({});
    expect(parseStoredOidcConfig('[1,2]')).toEqual({});

    const result = toPublicSsoProvider(
      { ...row, oidcConfig: '{"scopes":"oops"}' },
      'http://localhost:3333',
    );
    expect(result.clientId).toBeNull();
    expect(result.scopes).toEqual([]);
    expect(result.pkce).toBe(true);
  });
});

describe('buildDomainVerification', () => {
  it('describes the TXT record better-auth will look up', () => {
    expect(
      buildDomainVerification({ providerId: 'acme', token: 'tok123' }),
    ).toEqual({
      recordType: 'TXT',
      recordName: '_compai-sso-acme',
      recordValue: 'tok123',
    });
  });
});

describe('normalizeDomainList', () => {
  it('lowercases, trims and de-duplicates', () => {
    expect(normalizeDomainList(' Acme.com , sub.acme.com, acme.com ')).toBe(
      'acme.com,sub.acme.com',
    );
  });

  it('rejects empty input and non-hostnames', () => {
    expect(() => normalizeDomainList(' , ')).toThrow(BadRequestException);
    expect(() => normalizeDomainList('https://acme.com')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeDomainList('acme')).toThrow(BadRequestException);
  });
});
