import {
  BadGatewayException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { DiscoveryError, discoverOIDCConfig } from '@better-auth/sso';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { isStaticTrustedOrigin } from '../auth/origin-policy';

/**
 * OIDC discovery for provider registration.
 *
 * @better-auth/sso only fetches a discovery document from an origin listed in
 * better-auth's `trustedOrigins`, which would force every self-hoster (and,
 * on SaaS, every customer) to add their identity provider to
 * `AUTH_TRUSTED_ORIGINS` — an allowlist that also drives CORS and CSRF checks.
 * Instead we run the plugin's own discovery routine here with a Comp AI trust
 * rule (any publicly routable HTTPS host, or a statically trusted origin for
 * private IdPs) and register the provider with the discovered endpoints, so
 * better-auth never needs to fetch the document itself. Its runtime checks on
 * the token/JWKS endpoints are unaffected: they accept public hosts.
 */

export interface DiscoveredOidcEndpoints {
  discoveryEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  userInfoEndpoint?: string;
  tokenEndpointAuthentication?: 'client_secret_basic' | 'client_secret_post';
}

/** Hostnames that can never be a customer identity provider. */
const BLOCKED_HOSTNAMES = new Set(['localhost']);
const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.').map(Number);
  return parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

function isPublicIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false; // this-network, RFC 1918, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // shared address space (CGNAT)
  if (a === 169 && b === 254) return false; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC 1918
  if (a === 192 && b === 168) return false; // RFC 1918
  if (a === 192 && b === 0 && octets[2] === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isPublicIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return false;
  if (lower.startsWith('::ffff:'))
    return isPublicIpv4(lower.slice('::ffff:'.length)); // IPv4-mapped
  if (/^f[cd]/.test(lower)) return false; // unique local (fc00::/7)
  if (/^fe[89ab]/.test(lower)) return false; // link-local (fe80::/10)
  if (lower.startsWith('ff')) return false; // multicast
  return true;
}

/** RFC 6890 classification: true only for globally routable addresses. */
export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

/** True for hostnames (or IP literals) that could plausibly be a public IdP. */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return isPublicIpAddress(host);
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return false;
  // Single-label names (`idp`, `keycloak`) only resolve on a private network.
  return host.includes('.');
}

/**
 * Trust rule handed to the plugin's discovery routine. Statically trusted
 * origins (`AUTH_TRUSTED_ORIGINS`) remain the escape hatch for private IdPs,
 * and are the only way an `http://` endpoint is accepted.
 */
export function isAllowedIdpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (isStaticTrustedOrigin(parsed.origin)) return true;
  return parsed.protocol === 'https:' && isPublicHost(parsed.hostname);
}

type ResolveHost = (hostname: string) => Promise<Array<{ address: string }>>;

const resolveWithDns: ResolveHost = (hostname) =>
  lookup(hostname, { all: true });

/**
 * Best-effort DNS check before the server-side fetch: a public-looking name
 * that resolves to a private address (`idp.example.com` → `10.0.0.5`) is
 * refused unless its origin is statically trusted.
 */
export async function assertHostResolvesPublic({
  url,
  resolveHost = resolveWithDns,
}: {
  url: string;
  resolveHost?: ResolveHost;
}): Promise<void> {
  const parsed = new URL(url);
  if (isStaticTrustedOrigin(parsed.origin) || isIP(parsed.hostname)) return;

  let resolved: Array<{ address: string }>;
  try {
    resolved = await resolveHost(parsed.hostname);
  } catch {
    throw new BadRequestException(
      `Could not resolve the identity provider host "${parsed.hostname}"`,
    );
  }

  const privateAddress = resolved.find(
    ({ address }) => !isPublicIpAddress(address),
  );
  if (privateAddress) {
    throw new BadRequestException(
      `The identity provider host "${parsed.hostname}" resolves to a private address. Add its origin to AUTH_TRUSTED_ORIGINS if it is an internal IdP.`,
    );
  }
}

function mapDiscoveryError(error: unknown): HttpException {
  if (error instanceof DiscoveryError) {
    if (
      error.code === 'discovery_timeout' ||
      error.code === 'discovery_unexpected_error'
    ) {
      return new BadGatewayException(
        `Could not reach the identity provider: ${error.message}`,
      );
    }
    return new BadRequestException(
      `OpenID Connect discovery failed: ${error.message}`,
    );
  }
  if (error instanceof HttpException) return error;
  return new BadGatewayException('Could not reach the identity provider');
}

export async function discoverOidcEndpoints({
  issuer,
  discoveryEndpoint,
  discover = discoverOIDCConfig,
  resolveHost = resolveWithDns,
}: {
  issuer: string;
  discoveryEndpoint?: string;
  discover?: typeof discoverOIDCConfig;
  resolveHost?: ResolveHost;
}): Promise<DiscoveredOidcEndpoints> {
  for (const url of [issuer, discoveryEndpoint]) {
    if (!url) continue;
    if (!isAllowedIdpUrl(url)) {
      throw new BadRequestException(
        `The identity provider URL "${url}" must be a public https URL. Internal providers must be added to AUTH_TRUSTED_ORIGINS.`,
      );
    }
    await assertHostResolvesPublic({ url, resolveHost });
  }

  try {
    const hydrated = await discover({
      issuer,
      discoveryEndpoint,
      isTrustedOrigin: isAllowedIdpUrl,
    });
    return {
      discoveryEndpoint: hydrated.discoveryEndpoint,
      authorizationEndpoint: hydrated.authorizationEndpoint,
      tokenEndpoint: hydrated.tokenEndpoint,
      jwksEndpoint: hydrated.jwksEndpoint,
      userInfoEndpoint: hydrated.userInfoEndpoint,
      tokenEndpointAuthentication: hydrated.tokenEndpointAuthentication,
    };
  } catch (error) {
    throw mapDiscoveryError(error);
  }
}
