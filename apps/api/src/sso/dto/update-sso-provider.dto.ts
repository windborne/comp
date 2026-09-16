import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { SSO_DOMAIN_LIST_PATTERN } from './create-sso-provider.dto';

const URL_OPTIONS = {
  protocols: ['https', 'http'],
  require_protocol: true,
  require_tld: false,
};

/**
 * Partial update of an SSO provider. Omitted fields are left unchanged; the
 * client secret is only replaced when a new one is supplied. Changing the
 * domain resets its verification, and identity fields (client ID, discovery
 * endpoint) cannot change once users have signed in through the provider.
 */
export class UpdateSsoProviderDto {
  @ApiPropertyOptional({ description: 'OpenID Connect issuer URL.' })
  @IsOptional()
  @IsUrl(URL_OPTIONS, { message: 'issuer must be an absolute http(s) URL' })
  @MaxLength(2048)
  issuer?: string;

  @ApiPropertyOptional({
    description:
      'Email domain(s), comma-separated. Changing this requires re-verification.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(SSO_DOMAIN_LIST_PATTERN, {
    message:
      'domain must be one or more hostnames (e.g. acme.com) separated by commas',
  })
  domain?: string;

  @ApiPropertyOptional({
    description: 'OAuth client ID issued by the identity provider.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  clientId?: string;

  @ApiPropertyOptional({
    description: 'New OAuth client secret. Leave out to keep the current one.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  clientSecret?: string;

  @ApiPropertyOptional({ description: 'OpenID discovery document URL.' })
  @IsOptional()
  @IsUrl(URL_OPTIONS, {
    message: 'discoveryEndpoint must be an absolute http(s) URL',
  })
  @MaxLength(2048)
  discoveryEndpoint?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Scopes to request.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  scopes?: string[];

  @ApiPropertyOptional({
    description: 'Use PKCE for the authorization code flow.',
  })
  @IsOptional()
  @IsBoolean()
  pkce?: boolean;
}
