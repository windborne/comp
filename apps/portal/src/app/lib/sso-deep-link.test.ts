import { describe, expect, it } from 'vitest';
import { buildSsoDeepLink, parseSsoProviderIdParam } from './sso-deep-link';

describe('parseSsoProviderIdParam', () => {
  it('accepts a provider id slug, normalising case and whitespace', () => {
    expect(parseSsoProviderIdParam('windborne')).toBe('windborne');
    expect(parseSsoProviderIdParam(' Acme-Corp ')).toBe('acme-corp');
    expect(parseSsoProviderIdParam(['okta', 'other'])).toBe('okta');
  });

  it('ignores missing, malformed or oversized values', () => {
    expect(parseSsoProviderIdParam(undefined)).toBeUndefined();
    expect(parseSsoProviderIdParam('')).toBeUndefined();
    expect(parseSsoProviderIdParam('a')).toBeUndefined();
    expect(parseSsoProviderIdParam('acme corp')).toBeUndefined();
    expect(parseSsoProviderIdParam('-acme')).toBeUndefined();
    expect(parseSsoProviderIdParam('https://evil.example')).toBeUndefined();
    expect(parseSsoProviderIdParam('a'.repeat(41))).toBeUndefined();
  });
});

describe('buildSsoDeepLink', () => {
  it('builds the launcher link for a provider', () => {
    expect(buildSsoDeepLink({ origin: 'https://obey.example.com/', providerId: 'windborne' })).toBe(
      'https://obey.example.com/auth?sso=windborne',
    );
  });
});
