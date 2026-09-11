import { resolveCookieDomain } from './cookie-domain';

describe('resolveCookieDomain', () => {
  describe('explicit AUTH_COOKIE_DOMAIN (self-hosted)', () => {
    it('returns the configured domain', () => {
      expect(
        resolveCookieDomain({ AUTH_COOKIE_DOMAIN: '.windbornesystems.com' }),
      ).toBe('.windbornesystems.com');
    });

    it('adds the leading dot when omitted', () => {
      expect(
        resolveCookieDomain({ AUTH_COOKIE_DOMAIN: 'windbornesystems.com' }),
      ).toBe('.windbornesystems.com');
    });

    it('trims whitespace', () => {
      expect(
        resolveCookieDomain({ AUTH_COOKIE_DOMAIN: '  .example.com  ' }),
      ).toBe('.example.com');
    });

    it('wins over a trycomp.ai BASE_URL', () => {
      expect(
        resolveCookieDomain({
          AUTH_COOKIE_DOMAIN: '.example.com',
          BASE_URL: 'https://api.trycomp.ai',
        }),
      ).toBe('.example.com');
    });

    it('treats an empty or blank value as unset', () => {
      expect(resolveCookieDomain({ AUTH_COOKIE_DOMAIN: '' })).toBeUndefined();
      expect(resolveCookieDomain({ AUTH_COOKIE_DOMAIN: '   ' })).toBeUndefined();
    });
  });

  describe('hosted trycomp.ai environments (unchanged behaviour)', () => {
    it('staging', () => {
      expect(
        resolveCookieDomain({ BASE_URL: 'https://api.staging.trycomp.ai' }),
      ).toBe('.staging.trycomp.ai');
    });

    it('production', () => {
      expect(resolveCookieDomain({ BASE_URL: 'https://api.trycomp.ai' })).toBe(
        '.trycomp.ai',
      );
    });

    it('checks staging before production so it is not shadowed', () => {
      // 'staging.trycomp.ai' also contains 'trycomp.ai'
      expect(
        resolveCookieDomain({ BASE_URL: 'https://api.staging.trycomp.ai' }),
      ).not.toBe('.trycomp.ai');
    });
  });

  describe('host-only fallback', () => {
    it('returns undefined for localhost', () => {
      expect(
        resolveCookieDomain({ BASE_URL: 'http://localhost:3333' }),
      ).toBeUndefined();
    });

    it('returns undefined for an arbitrary self-hosted domain without the env var', () => {
      // This is the case that made sibling-hostname deployments impossible
      // before AUTH_COOKIE_DOMAIN existed.
      expect(
        resolveCookieDomain({ BASE_URL: 'https://obey.windbornesystems.com' }),
      ).toBeUndefined();
    });

    it('returns undefined when nothing is set', () => {
      expect(resolveCookieDomain({})).toBeUndefined();
    });
  });
});
