import { db } from '@db';
import { z } from 'zod';
import { decrypt, encrypt } from '../secrets/encryption.util';
import type { ZulipCredentials } from './zulip-client';

const encryptedDataSchema = z.object({
  encrypted: z.string(),
  iv: z.string(),
  tag: z.string(),
  salt: z.string(),
});

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

/** Encrypts a bot API key for storage; requires ENCRYPTION_KEY. */
export function encryptBotApiKey(botApiKey: string): string {
  return JSON.stringify(encrypt(botApiKey));
}

export function decryptBotApiKey(stored: string): string {
  return decrypt(encryptedDataSchema.parse(JSON.parse(stored)));
}

/**
 * Loads the organization's Zulip bot credentials, or null when Zulip is not
 * connected. Disabled integrations are skipped unless `includeDisabled` is set
 * (used by the settings test button).
 */
export async function loadZulipCredentials({
  organizationId,
  includeDisabled = false,
}: {
  organizationId: string;
  includeDisabled?: boolean;
}): Promise<ZulipCredentials | null> {
  const integration = await db.zulipIntegration.findUnique({
    where: { organizationId },
  });
  if (!integration) return null;
  if (!integration.enabled && !includeDisabled) return null;

  return {
    siteUrl: integration.siteUrl,
    botEmail: integration.botEmail,
    botApiKey: decryptBotApiKey(integration.botApiKey),
  };
}
