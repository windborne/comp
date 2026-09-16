import { BadRequestException } from '@nestjs/common';
import type { SsoProvider } from '@db';
import {
  getSsoDomainVerificationRecordName,
  getSsoRedirectUri,
  parseProviderDomains,
  SSO_DOMAIN_PATTERN,
} from '../auth/sso/sso-domain';

/** What the API returns for a provider. Never includes the client secret. */
export interface PublicSsoProvider {
  id: string;
  providerId: string;
  issuer: string;
  domain: string;
  domainVerified: boolean;
  clientId: string | null;
  scopes: string[];
  pkce: boolean;
  discoveryEndpoint: string | null;
  /** Redirect/callback URI to register with the identity provider. */
  redirectUri: string;
  createdAt: string;
  updatedAt: string;
}

export interface SsoDomainVerificationInstructions {
  recordType: 'TXT';
  /** Record name relative to the root domain, e.g. `_compai-sso-acme`. */
  recordName: string;
  recordValue: string;
}

export type SsoProviderRow = Pick<
  SsoProvider,
  | 'id'
  | 'providerId'
  | 'issuer'
  | 'domain'
  | 'domainVerified'
  | 'oidcConfig'
  | 'createdAt'
  | 'updatedAt'
>;

interface StoredOidcConfig {
  clientId?: string;
  scopes?: string[];
  pkce?: boolean;
  discoveryEndpoint?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

/** Reads the public parts of the JSON blob better-auth stores per provider. */
export function parseStoredOidcConfig(raw: string | null): StoredOidcConfig {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  return {
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
    scopes: isStringArray(parsed.scopes) ? parsed.scopes : undefined,
    pkce: typeof parsed.pkce === 'boolean' ? parsed.pkce : undefined,
    discoveryEndpoint:
      typeof parsed.discoveryEndpoint === 'string'
        ? parsed.discoveryEndpoint
        : undefined,
  };
}

export function toPublicSsoProvider(
  row: SsoProviderRow,
  apiBaseUrl: string,
): PublicSsoProvider {
  const oidc = parseStoredOidcConfig(row.oidcConfig);
  return {
    id: row.id,
    providerId: row.providerId,
    issuer: row.issuer,
    domain: row.domain,
    domainVerified: row.domainVerified,
    clientId: oidc.clientId ?? null,
    scopes: oidc.scopes ?? [],
    pkce: oidc.pkce ?? true,
    discoveryEndpoint: oidc.discoveryEndpoint ?? null,
    redirectUri: getSsoRedirectUri({ apiBaseUrl, providerId: row.providerId }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildDomainVerification({
  providerId,
  token,
}: {
  providerId: string;
  token: string;
}): SsoDomainVerificationInstructions {
  return {
    recordType: 'TXT',
    recordName: getSsoDomainVerificationRecordName(providerId),
    recordValue: token,
  };
}

/**
 * Normalises a comma-separated domain list to the lowercase, de-duplicated
 * form better-auth matches against, rejecting anything that isn't a bare hostname.
 */
export function normalizeDomainList(input: string): string {
  const domains = parseProviderDomains(input);
  if (domains.length === 0) {
    throw new BadRequestException('At least one email domain is required');
  }
  for (const domain of domains) {
    if (!SSO_DOMAIN_PATTERN.test(domain)) {
      throw new BadRequestException(
        `"${domain}" is not a valid email domain. Use a bare hostname such as acme.com`,
      );
    }
  }
  return [...new Set(domains)].join(',');
}
