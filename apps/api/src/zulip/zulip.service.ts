import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { db, type ZulipIntegration } from '@db';
import type { UpsertZulipIntegrationDto } from './dto/upsert-zulip-integration.dto';
import {
  normalizeZulipSiteUrl,
  sendZulipDirectMessage,
  type ZulipSendResult,
} from './zulip-client';
import {
  encryptBotApiKey,
  isEncryptionConfigured,
  loadZulipCredentials,
} from './zulip-credentials';

export interface ZulipSettingsView {
  configured: boolean;
  enabled: boolean;
  siteUrl: string | null;
  botEmail: string | null;
  updatedAt: string | null;
}

const TEST_MESSAGE =
  '**Comp AI test message**\n\nZulip is connected. Notifications you would receive by email will also arrive here as direct messages.';

function toView(integration: ZulipIntegration | null): ZulipSettingsView {
  if (!integration) {
    return {
      configured: false,
      enabled: false,
      siteUrl: null,
      botEmail: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    enabled: integration.enabled,
    siteUrl: integration.siteUrl,
    botEmail: integration.botEmail,
    updatedAt: integration.updatedAt.toISOString(),
  };
}

@Injectable()
export class ZulipService {
  async getSettings(organizationId: string): Promise<ZulipSettingsView> {
    const integration = await db.zulipIntegration.findUnique({
      where: { organizationId },
    });
    return toView(integration);
  }

  async upsertSettings({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: UpsertZulipIntegrationDto;
  }): Promise<ZulipSettingsView> {
    const existing = await db.zulipIntegration.findUnique({
      where: { organizationId },
    });
    if (dto.botApiKey && !isEncryptionConfigured()) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY is not set on the API; it is required to store the Zulip bot key',
      );
    }

    const botApiKey = dto.botApiKey
      ? encryptBotApiKey(dto.botApiKey)
      : existing?.botApiKey;
    if (!botApiKey) {
      throw new BadRequestException('botApiKey is required to connect Zulip');
    }

    const siteUrl = normalizeZulipSiteUrl(dto.siteUrl);
    const botEmail = dto.botEmail.trim().toLowerCase();
    const enabled = dto.enabled ?? existing?.enabled ?? true;

    const saved = await db.zulipIntegration.upsert({
      where: { organizationId },
      create: { organizationId, siteUrl, botEmail, botApiKey, enabled },
      update: { siteUrl, botEmail, botApiKey, enabled },
    });
    return toView(saved);
  }

  async removeSettings(organizationId: string): Promise<{ success: true }> {
    await db.zulipIntegration.deleteMany({ where: { organizationId } });
    return { success: true };
  }

  /** Sends a test direct message to `email` through the organization's bot. */
  async sendTestMessage({
    organizationId,
    email,
  }: {
    organizationId: string;
    email: string;
  }): Promise<ZulipSendResult> {
    const credentials = await loadZulipCredentials({
      organizationId,
      includeDisabled: true,
    });
    if (!credentials) {
      throw new BadRequestException(
        'Zulip is not connected for this organization',
      );
    }
    return sendZulipDirectMessage({
      credentials,
      to: email,
      content: TEST_MESSAGE,
    });
  }
}
