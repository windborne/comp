import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

const SITE_URL_OPTIONS = {
  protocols: ['https', 'http'],
  require_protocol: true,
  require_tld: false,
};

/**
 * Connects (or updates) the organization's Zulip bot. A class so the global
 * ValidationPipe can whitelist fields.
 */
export class UpsertZulipIntegrationDto {
  @ApiProperty({
    description: 'Zulip server URL.',
    example: 'https://chat.example.com',
  })
  @IsUrl(SITE_URL_OPTIONS, {
    message: 'siteUrl must be an absolute http(s) URL',
  })
  @MaxLength(2048)
  siteUrl!: string;

  @ApiProperty({
    description: 'Email address of the Zulip bot that sends the messages.',
    example: 'comp-bot@chat.example.com',
  })
  @IsEmail({}, { message: 'botEmail must be an email address' })
  @MaxLength(320)
  botEmail!: string;

  @ApiPropertyOptional({
    description:
      'API key of the bot. Required when connecting; omit to keep the stored key. Never returned.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  botApiKey?: string;

  @ApiPropertyOptional({
    description: 'Mirror notifications to Zulip. Defaults to true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
