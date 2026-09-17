/**
 * `/auth?sso=<provider-id>` starts single sign-on immediately. OIDC has no
 * standard IdP-initiated flow, so identity-provider launchers (Okta tiles,
 * UniFi Identity apps, …) point at this link instead of the callback URL.
 */

const PROVIDER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PROVIDER_ID_MAX_LENGTH = 40;

/** The provider id from the query string, or undefined for anything unusable. */
export function parseSsoProviderIdParam(
  value: string | string[] | null | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  const candidate = raw.trim().toLowerCase();
  if (candidate.length < 2 || candidate.length > PROVIDER_ID_MAX_LENGTH) return undefined;
  return PROVIDER_ID_PATTERN.test(candidate) ? candidate : undefined;
}

export function buildSsoDeepLink({
  origin,
  providerId,
}: {
  origin: string;
  providerId: string;
}): string {
  return `${origin.replace(/\/+$/, '')}/auth?sso=${encodeURIComponent(providerId)}`;
}
