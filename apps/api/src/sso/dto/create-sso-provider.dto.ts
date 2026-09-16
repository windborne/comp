import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SSO_PROVIDER_ID_MAX_LENGTH,
  SSO_PROVIDER_ID_PATTERN,
} from '../../auth/sso/sso-domain';

/**
 * Scopes requested from the identity provider. better-auth's own default adds
 * `offline_access`, which several IdPs (Google Workspace among them) reject.
 */
export const SSO_DEFAULT_SCOPES = ['openid', 'profile', 'email'];

/** Coarse shape check for a comma-separated hostname list; entries are validated in the service. */
export const SSO_DOMAIN_LIST_PATTERN = /^[a-z0-9.-]+(?:\s*,\s*[a-z0-9.-]+)*$/i;

const ISSUER_URL_OPTIONS = {
  protocols: ['https', 'http'],
  require_protocol: true,
  require_tld: false,
};

/**
 * Registers an OpenID Connect identity provider for the active organization.
 * A class (not an interface) so the global ValidationPipe can whitelist fields.
 */
export class CreateSsoProviderDto {
  @ApiProperty({
    description:
      'URL-safe identifier that becomes part of the callback URL and the DNS verification record. Lowercase letters, digits and hyphens.',
    example: 'acme',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(SSO_PROVIDER_ID_MAX_LENGTH)
  @Matches(SSO_PROVIDER_ID_PATTERN, {
    message:
      'providerId must be lowercase letters, digits and hyphens, starting and ending with a letter or digit',
  })
  providerId!: string;

  @ApiProperty({
    description:
      'OpenID Connect issuer URL exactly as published by the identity provider.',
    example: 'https://login.microsoftonline.com/<tenant-id>/v2.0',
  })
  @IsUrl(ISSUER_URL_OPTIONS, {
    message: 'issuer must be an absolute http(s) URL',
  })
  @MaxLength(2048)
  issuer!: string;

  @ApiProperty({
    description:
      'Email domain(s) whose users sign in through this provider, comma-separated. Ownership must be proven with a DNS TXT record before sign-in works.',
    example: 'acme.com',
  })
  @IsString()
  @MaxLength(1024)
  @Matches(SSO_DOMAIN_LIST_PATTERN, {
    message:
      'domain must be one or more hostnames (e.g. acme.com) separated by commas',
  })
  domain!: string;

  @ApiProperty({
    description: 'OAuth client ID issued by the identity provider.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  clientId!: string;

  @ApiProperty({
    description:
      'OAuth client secret issued by the identity provider. Used for the token exchange and never returned by the API.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  clientSecret!: string;

  @ApiPropertyOptional({
    description:
      'OpenID discovery document URL. Defaults to <issuer>/.well-known/openid-configuration.',
  })
  @IsOptional()
  @IsUrl(ISSUER_URL_OPTIONS, {
    message: 'discoveryEndpoint must be an absolute http(s) URL',
  })
  @MaxLength(2048)
  discoveryEndpoint?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Scopes to request. Defaults to openid, profile and email.',
    example: SSO_DEFAULT_SCOPES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  scopes?: string[];

  @ApiPropertyOptional({
    description:
      'Use PKCE for the authorization code flow (recommended). Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  pkce?: boolean;
}
