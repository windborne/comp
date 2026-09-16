/**
 * Domain rules shared by the SSO plugin config (./sso-plugin.ts), the database
 * hooks that fence SSO identities to their provider's verified domain
 * (./sso-hooks.ts) and the NestJS SSO API (apps/api/src/sso).
 *
 * Kept free of better-auth/Prisma imports so it is trivially unit-testable.
 */

/** better-auth endpoint path prefix of the OIDC callback (`/sso/callback/:providerId`). */
export const SSO_CALLBACK_PATH_PREFIX = '/sso/callback';

/**
 * Prefix of the DNS TXT record an organization publishes to prove it owns the
 * email domain it wants to sign users in for. better-auth prepends `_` and
 * appends `-<providerId>` (RFC 8552 subdomain convention), so the record an
 * admin creates is `_compai-sso-<providerId>.<domain>`.
 */
export const SSO_DOMAIN_VERIFICATION_TOKEN_PREFIX = 'compai-sso';

/** DNS labels are capped at 63 characters; keep room for the prefix + `_` + `-`. */
export const SSO_PROVIDER_ID_MAX_LENGTH = 40;

/** Provider IDs become part of a URL and a DNS label: lowercase slug only. */
export const SSO_PROVIDER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Bare hostname such as `acme.com` or `corp.acme.co.uk` (no scheme, path or port). */
export const SSO_DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Normalise better-auth's comma-separated provider domain list. */
export function parseProviderDomains(domainList: string): string[] {
  return domainList
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function extractEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain.length > 0 ? domain : null;
}

/**
 * Mirrors @better-auth/sso's matching: the candidate must equal a listed
 * domain or be a subdomain of one (`mail.acme.com` matches `acme.com`).
 */
export function domainMatches({
  candidate,
  domainList,
}: {
  candidate: string;
  domainList: string;
}): boolean {
  const search = candidate.trim().toLowerCase();
  if (!search) return false;
  return parseProviderDomains(domainList).some(
    (domain) => search === domain || search.endsWith(`.${domain}`),
  );
}

/** Whether an identity asserted by a provider may sign in through it. */
export function isEmailAllowedForProvider({
  email,
  providerDomain,
}: {
  email: string;
  providerDomain: string;
}): boolean {
  const emailDomain = extractEmailDomain(email);
  if (!emailDomain) return false;
  return domainMatches({ candidate: emailDomain, domainList: providerDomain });
}

/** True for the better-auth endpoint path (`ctx.path`) of the OIDC callback. */
export function isSsoCallbackPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && path.startsWith(SSO_CALLBACK_PATH_PREFIX);
}

/** True when the HTTP request better-auth is serving is the OIDC callback. */
export function isSsoCallbackRequest(
  request: { url?: string } | null | undefined,
): boolean {
  if (!request?.url) return false;
  try {
    return new URL(request.url).pathname.includes(SSO_CALLBACK_PATH_PREFIX);
  } catch {
    return false;
  }
}

/** Name of the DNS TXT record proving ownership of a provider's domain. */
export function getSsoDomainVerificationRecordName(providerId: string): string {
  return `_${SSO_DOMAIN_VERIFICATION_TOKEN_PREFIX}-${providerId}`;
}

/** Redirect/callback URI to register with the identity provider. */
export function getSsoRedirectUri({
  apiBaseUrl,
  providerId,
}: {
  apiBaseUrl: string;
  providerId: string;
}): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  return `${base}/api/auth${SSO_CALLBACK_PATH_PREFIX}/${encodeURIComponent(providerId)}`;
}
