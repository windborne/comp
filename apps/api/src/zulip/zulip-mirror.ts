import { Logger } from '@nestjs/common';
import type { EmailChannel } from '../trigger/email/send-email';
import { emailHtmlToZulipMarkdown } from './email-to-zulip';
import { sendZulipDirectMessage } from './zulip-client';
import { loadZulipCredentials } from './zulip-credentials';

const logger = new Logger('ZulipMirror');

/** Channels whose recipients are outside the organization (no Zulip account to match). */
const EXTERNAL_CHANNELS: ReadonlySet<EmailChannel> = new Set<EmailChannel>([
  'trustPortal',
  'marketing',
]);

/**
 * Mirrors a notification email as a Zulip direct message to the same address,
 * when the organization has Zulip connected. Emails without an organization
 * (sign-in codes, magic links) are never mirrored. Never throws.
 */
export async function mirrorEmailToZulip({
  organizationId,
  to,
  subject,
  html,
  channel,
}: {
  organizationId?: string;
  to: string;
  subject: string;
  html: string;
  channel?: EmailChannel;
}): Promise<void> {
  if (!organizationId) return;
  if (channel && EXTERNAL_CHANNELS.has(channel)) return;

  try {
    const credentials = await loadZulipCredentials({ organizationId });
    if (!credentials) return;

    const result = await sendZulipDirectMessage({
      credentials,
      to,
      content: emailHtmlToZulipMarkdown({ subject, html }),
    });
    if (result.sent) {
      logger.log(`Mirrored "${subject}" to ${to} as a Zulip direct message`);
    }
  } catch (error) {
    logger.warn(
      `Skipping Zulip mirror of "${subject}" to ${to}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
