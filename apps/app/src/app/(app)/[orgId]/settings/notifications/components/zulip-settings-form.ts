import type { SaveZulipSettingsInput, ZulipSettings } from '@/hooks/use-zulip-integration';
import { z } from 'zod';

const baseSchema = z.object({
  siteUrl: z.string().trim().url('Enter the Zulip server URL, e.g. https://chat.example.com'),
  botEmail: z.string().trim().email('Enter the bot email address'),
  botApiKey: z.string().trim(),
  enabled: z.boolean(),
});

export type ZulipSettingsFormValues = z.infer<typeof baseSchema>;

/**
 * Mirrors the API's UpsertZulipIntegrationDto so errors show inline. The bot
 * key is only mandatory the first time; afterwards an empty field keeps the
 * stored key.
 */
export function buildZulipSettingsFormSchema({ requireApiKey }: { requireApiKey: boolean }) {
  if (!requireApiKey) return baseSchema;
  return baseSchema.extend({
    botApiKey: z.string().trim().min(1, 'Enter the bot API key'),
  });
}

export function zulipSettingsToFormValues(settings: ZulipSettings): ZulipSettingsFormValues {
  return {
    siteUrl: settings.siteUrl ?? '',
    botEmail: settings.botEmail ?? '',
    botApiKey: '',
    enabled: settings.configured ? settings.enabled : true,
  };
}

/** An empty key means "keep the stored one", so it is dropped from the request. */
export function toSaveZulipSettingsInput(values: ZulipSettingsFormValues): SaveZulipSettingsInput {
  return {
    siteUrl: values.siteUrl,
    botEmail: values.botEmail,
    enabled: values.enabled,
    ...(values.botApiKey ? { botApiKey: values.botApiKey } : {}),
  };
}
