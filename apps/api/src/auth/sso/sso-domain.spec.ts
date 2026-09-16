import {
  domainMatches,
  extractEmailDomain,
  getSsoDomainVerificationRecordName,
  getSsoRedirectUri,
  isEmailAllowedForProvider,
  isSsoCallbackPath,
  isSsoCallbackRequest,
  parseProviderDomains,
  SSO_DOMAIN_PATTERN,
  SSO_PROVIDER_ID_PATTERN,
} from './sso-domain';

describe('sso-domain', () => {
  describe('parseProviderDomains', () => {
    it('splits, trims and lowercases a comma-separated list', () => {
      expect(parseProviderDomains(' Acme.com, sub.ACME.com ,, ')).toEqual([
        'acme.com',
        'sub.acme.com',
      ]);
    });
  });

  describe('extractEmailDomain', () => {
    it('returns the lowercased domain part', () => {
      expect(extractEmailDomain('Alice@Acme.COM')).toBe('acme.com');
    });

    it('returns null for values without a domain', () => {
      expect(extractEmailDomain('alice')).toBeNull();
      expect(extractEmailDomain('alice@')).toBeNull();
    });
  });

  describe('domainMatches', () => {
    it('matches exact domains and subdomains, like @better-auth/sso', () => {
      expect(
        domainMatches({ candidate: 'acme.com', domainList: 'acme.com' }),
      ).toBe(true);
      expect(
        domainMatches({ candidate: 'mail.acme.com', domainList: 'acme.com' }),
      ).toBe(true);
      expect(
        domainMatches({
          candidate: 'acme.com',
          domainList: 'other.com,acme.com',
        }),
      ).toBe(true);
    });

    it('rejects look-alike domains', () => {
      // "notacme.com" ends with "acme.com" but is not a subdomain of it.
      expect(
        domainMatches({ candidate: 'notacme.com', domainList: 'acme.com' }),
      ).toBe(false);
      expect(
        domainMatches({
          candidate: 'acme.com.evil.io',
          domainList: 'acme.com',
        }),
      ).toBe(false);
      expect(domainMatches({ candidate: '', domainList: 'acme.com' })).toBe(
        false,
      );
    });
  });

  describe('isEmailAllowedForProvider', () => {
    it('accepts emails under the provider domain', () => {
      expect(
        isEmailAllowedForProvider({
          email: 'bob@corp.acme.com',
          providerDomain: 'acme.com',
        }),
      ).toBe(true);
    });

    it('rejects foreign emails asserted by the provider', () => {
      // The attack this guards against: Acme's IdP asserting a bank.com address.
      expect(
        isEmailAllowedForProvider({
          email: 'alice@bank.com',
          providerDomain: 'acme.com',
        }),
      ).toBe(false);
      expect(
        isEmailAllowedForProvider({
          email: 'garbage',
          providerDomain: 'acme.com',
        }),
      ).toBe(false);
    });
  });

  describe('isSsoCallbackPath', () => {
    it('recognises the OIDC callback endpoint pattern and concrete paths', () => {
      expect(isSsoCallbackPath('/sso/callback/:providerId')).toBe(true);
      expect(isSsoCallbackPath('/sso/callback/acme')).toBe(true);
    });

    it('ignores every other better-auth endpoint', () => {
      expect(isSsoCallbackPath('/callback/google')).toBe(false);
      expect(isSsoCallbackPath('/sign-in/sso')).toBe(false);
      expect(isSsoCallbackPath('/sso/register')).toBe(false);
      expect(isSsoCallbackPath(undefined)).toBe(false);
      expect(isSsoCallbackPath(null)).toBe(false);
    });
  });

  describe('isSsoCallbackRequest', () => {
    it('matches the callback URL regardless of the mount path', () => {
      expect(
        isSsoCallbackRequest({
          url: 'https://api.trycomp.ai/api/auth/sso/callback/acme?code=x&state=y',
        }),
      ).toBe(true);
    });

    it('is false for other auth requests, missing requests and bad URLs', () => {
      expect(
        isSsoCallbackRequest({
          url: 'https://api.trycomp.ai/api/auth/sign-up/email',
        }),
      ).toBe(false);
      expect(isSsoCallbackRequest(undefined)).toBe(false);
      expect(isSsoCallbackRequest({ url: 'not a url' })).toBe(false);
    });
  });

  describe('DNS + redirect helpers', () => {
    it('builds the TXT record name better-auth resolves (RFC 8552 underscore label)', () => {
      expect(getSsoDomainVerificationRecordName('acme')).toBe(
        '_compai-sso-acme',
      );
    });

    it('builds the per-provider redirect URI without duplicating slashes', () => {
      expect(
        getSsoRedirectUri({
          apiBaseUrl: 'https://api.trycomp.ai/',
          providerId: 'acme',
        }),
      ).toBe('https://api.trycomp.ai/api/auth/sso/callback/acme');
    });
  });

  describe('validation patterns', () => {
    it('accepts slugs and rejects anything that cannot be a URL segment or DNS label', () => {
      expect(SSO_PROVIDER_ID_PATTERN.test('acme')).toBe(true);
      expect(SSO_PROVIDER_ID_PATTERN.test('acme-corp-2')).toBe(true);
      expect(SSO_PROVIDER_ID_PATTERN.test('Acme')).toBe(false);
      expect(SSO_PROVIDER_ID_PATTERN.test('-acme')).toBe(false);
      expect(SSO_PROVIDER_ID_PATTERN.test('acme_corp')).toBe(false);
      expect(SSO_PROVIDER_ID_PATTERN.test('a b')).toBe(false);
    });

    it('accepts bare hostnames only', () => {
      expect(SSO_DOMAIN_PATTERN.test('acme.com')).toBe(true);
      expect(SSO_DOMAIN_PATTERN.test('corp.acme.co.uk')).toBe(true);
      expect(SSO_DOMAIN_PATTERN.test('https://acme.com')).toBe(false);
      expect(SSO_DOMAIN_PATTERN.test('acme.com/path')).toBe(false);
      expect(SSO_DOMAIN_PATTERN.test('localhost')).toBe(false);
    });
  });
});
