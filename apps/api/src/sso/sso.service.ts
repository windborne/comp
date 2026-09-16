import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { auth } from '../auth/auth.server';
import { domainMatches, parseProviderDomains } from '../auth/sso/sso-domain';
import { callBetterAuth } from './better-auth-call';
import { discoverOidcEndpoints } from './sso-discovery';
import {
  CreateSsoProviderDto,
  SSO_DEFAULT_SCOPES,
} from './dto/create-sso-provider.dto';
import type { UpdateSsoProviderDto } from './dto/update-sso-provider.dto';
import {
  buildDomainVerification,
  normalizeDomainList,
  toPublicSsoProvider,
  type PublicSsoProvider,
  type SsoDomainVerificationInstructions,
  type SsoProviderRow,
} from './sso-provider.mapper';

export interface SsoProviderCreated extends PublicSsoProvider {
  domainVerification: SsoDomainVerificationInstructions;
}

interface OrgProviderRef {
  organizationId: string;
  providerId: string;
}

interface ProviderCall extends OrgProviderRef {
  /** Session credentials of the acting user, forwarded to better-auth. */
  headers: Headers;
}

/**
 * Organization-scoped management of single sign-on providers.
 *
 * Writes are delegated to the @better-auth/sso endpoints so registration keeps
 * their validation (OIDC discovery, reserved provider IDs, identity-boundary
 * rules on update, account cleanup on delete) and their own owner/admin check.
 * This layer adds what those endpoints lack: Comp AI RBAC + audit logging (via
 * the controller), tenant scoping, global domain uniqueness, and responses
 * that never include the client secret.
 */
@Injectable()
export class SsoService {
  private get apiBaseUrl(): string {
    return process.env.BASE_URL ?? 'http://localhost:3333';
  }

  async listProviders(organizationId: string): Promise<PublicSsoProvider[]> {
    const rows = await db.ssoProvider.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => toPublicSsoProvider(row, this.apiBaseUrl));
  }

  async createProvider({
    organizationId,
    headers,
    dto,
  }: {
    organizationId: string;
    headers: Headers;
    dto: CreateSsoProviderDto;
  }): Promise<SsoProviderCreated> {
    const domain = normalizeDomainList(dto.domain);
    await this.assertDomainsAvailable({ domain });

    // Discovery runs here (public IdPs need no trusted-origins entry) and the
    // endpoints are handed to better-auth verbatim — see ./sso-discovery.ts.
    const endpoints = await discoverOidcEndpoints({
      issuer: dto.issuer,
      discoveryEndpoint: dto.discoveryEndpoint,
    });

    const registered = await callBetterAuth(() =>
      auth.api.registerSSOProvider({
        headers,
        body: {
          providerId: dto.providerId,
          issuer: dto.issuer,
          domain,
          organizationId,
          oidcConfig: {
            clientId: dto.clientId,
            clientSecret: dto.clientSecret,
            skipDiscovery: true,
            ...endpoints,
            scopes: dto.scopes ?? SSO_DEFAULT_SCOPES,
            pkce: dto.pkce ?? true,
          },
        },
      }),
    );

    const row = await this.requireOrgProvider({
      organizationId,
      providerId: dto.providerId,
    });
    const token = registered.domainVerificationToken;
    const domainVerification =
      typeof token === 'string'
        ? buildDomainVerification({ providerId: row.providerId, token })
        : await this.getDomainVerification({
            organizationId,
            headers,
            providerId: row.providerId,
          });

    return { ...toPublicSsoProvider(row, this.apiBaseUrl), domainVerification };
  }

  /** DNS record the org must publish. Idempotent while a token is pending. */
  async getDomainVerification({
    organizationId,
    headers,
    providerId,
  }: ProviderCall): Promise<SsoDomainVerificationInstructions> {
    const row = await this.requireOrgProvider({ organizationId, providerId });
    if (row.domainVerified) {
      throw new ConflictException(
        'The domain for this provider is already verified',
      );
    }

    const result = await callBetterAuth(() =>
      auth.api.requestDomainVerification({ headers, body: { providerId } }),
    );
    return buildDomainVerification({
      providerId,
      token: result.domainVerificationToken,
    });
  }

  async verifyDomain({
    organizationId,
    headers,
    providerId,
  }: ProviderCall): Promise<PublicSsoProvider> {
    await this.requireOrgProvider({ organizationId, providerId });
    await callBetterAuth(() =>
      auth.api.verifyDomain({ headers, body: { providerId } }),
    );

    const row = await this.requireOrgProvider({ organizationId, providerId });
    return toPublicSsoProvider(row, this.apiBaseUrl);
  }

  async updateProvider({
    organizationId,
    headers,
    providerId,
    dto,
  }: ProviderCall & { dto: UpdateSsoProviderDto }): Promise<PublicSsoProvider> {
    await this.requireOrgProvider({ organizationId, providerId });

    const domain =
      dto.domain === undefined ? undefined : normalizeDomainList(dto.domain);
    if (domain !== undefined) {
      await this.assertDomainsAvailable({
        domain,
        excludeProviderId: providerId,
      });
    }

    const oidcConfig = buildOidcConfigUpdate(dto);
    if (dto.issuer === undefined && domain === undefined && !oidcConfig) {
      throw new BadRequestException('No fields provided for update');
    }

    await callBetterAuth(() =>
      auth.api.updateSSOProvider({
        headers,
        body: { providerId, issuer: dto.issuer, domain, oidcConfig },
      }),
    );

    const row = await this.requireOrgProvider({ organizationId, providerId });
    return toPublicSsoProvider(row, this.apiBaseUrl);
  }

  async deleteProvider({
    organizationId,
    headers,
    providerId,
  }: ProviderCall): Promise<{ success: true }> {
    await this.requireOrgProvider({ organizationId, providerId });
    await callBetterAuth(() =>
      auth.api.deleteSSOProvider({ headers, body: { providerId } }),
    );
    return { success: true };
  }

  /** Tenant isolation: a provider is only reachable from the org that owns it. */
  private async requireOrgProvider({
    organizationId,
    providerId,
  }: OrgProviderRef): Promise<SsoProviderRow> {
    const row = await db.ssoProvider.findFirst({
      where: { providerId, organizationId },
    });
    if (!row) {
      throw new NotFoundException('Single sign-on provider not found');
    }
    return row;
  }

  /**
   * Sign-in resolves a provider from the email domain, so a domain (or a
   * parent/subdomain of one) may only be registered once across the platform.
   */
  private async assertDomainsAvailable({
    domain,
    excludeProviderId,
  }: {
    domain: string;
    excludeProviderId?: string;
  }): Promise<void> {
    const requested = parseProviderDomains(domain);
    const others = await db.ssoProvider.findMany({
      where: excludeProviderId
        ? { providerId: { not: excludeProviderId } }
        : undefined,
      select: { domain: true },
    });

    const overlaps = others.some((other) =>
      requested.some(
        (candidate) =>
          domainMatches({ candidate, domainList: other.domain }) ||
          parseProviderDomains(other.domain).some((existing) =>
            domainMatches({ candidate: existing, domainList: candidate }),
          ),
      ),
    );
    if (overlaps) {
      throw new ConflictException(
        'This email domain is already registered with a single sign-on provider',
      );
    }
  }
}

type UpdateSsoProviderInput = NonNullable<
  Parameters<typeof auth.api.updateSSOProvider>[0]
>;
type OidcConfigUpdate = NonNullable<
  NonNullable<UpdateSsoProviderInput['body']>['oidcConfig']
>;

function buildOidcConfigUpdate(
  dto: UpdateSsoProviderDto,
): OidcConfigUpdate | undefined {
  const update: OidcConfigUpdate = {};
  if (dto.clientId !== undefined) update.clientId = dto.clientId;
  if (dto.clientSecret !== undefined) update.clientSecret = dto.clientSecret;
  if (dto.discoveryEndpoint !== undefined)
    update.discoveryEndpoint = dto.discoveryEndpoint;
  if (dto.scopes !== undefined) update.scopes = dto.scopes;
  if (dto.pkce !== undefined) update.pkce = dto.pkce;
  return Object.keys(update).length > 0 ? update : undefined;
}
