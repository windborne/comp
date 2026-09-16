import { describe, expect, it } from 'vitest';
import { buildRedirectUriPreview, parseScopes, ssoProviderFormSchema } from './sso-provider-form';

describe('sso-provider-form', () => {
  it('splits scopes on spaces and commas', () => {
    expect(parseScopes('openid profile, email  ')).toEqual(['openid', 'profile', 'email']);
    expect(parseScopes('')).toEqual([]);
  });

  it('previews the callback URL the admin registers with the IdP', () => {
    expect(
      buildRedirectUriPreview({ apiBaseUrl: 'https://api.trycomp.ai/', providerId: 'acme' }),
    ).toBe('https://api.trycomp.ai/api/auth/sso/callback/acme');
    expect(buildRedirectUriPreview({ apiBaseUrl: 'http://localhost:3333', providerId: '' })).toBe(
      'http://localhost:3333/api/auth/sso/callback/<provider-id>',
    );
  });

  it('validates the same rules as the API DTO', () => {
    const valid = {
      providerId: 'acme',
      issuer: 'https://login.acme.com',
      domain: 'acme.com, corp.acme.com',
      clientId: 'cid',
      clientSecret: 'secret',
      scopes: 'openid profile email',
      pkce: true,
    };
    expect(ssoProviderFormSchema.safeParse(valid).success).toBe(true);
    expect(ssoProviderFormSchema.safeParse({ ...valid, providerId: 'Acme Corp' }).success).toBe(
      false,
    );
    expect(ssoProviderFormSchema.safeParse({ ...valid, issuer: 'login.acme.com' }).success).toBe(
      false,
    );
    expect(ssoProviderFormSchema.safeParse({ ...valid, domain: 'https://acme.com' }).success).toBe(
      false,
    );
    expect(ssoProviderFormSchema.safeParse({ ...valid, clientSecret: '' }).success).toBe(false);
  });
});
