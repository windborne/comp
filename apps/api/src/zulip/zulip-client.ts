import { Logger } from '@nestjs/common';
import { z } from 'zod';

const logger = new Logger('ZulipClient');

/** Zulip's default maximum message length. */
export const ZULIP_MAX_MESSAGE_LENGTH = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface ZulipCredentials {
  siteUrl: string;
  botEmail: string;
  botApiKey: string;
}

export type ZulipSendResult =
  { sent: true; messageId: number | null } | { sent: false; reason: string };

const zulipResponseSchema = z.object({
  result: z.string(),
  msg: z.string().optional(),
  code: z.string().optional(),
  id: z.number().optional(),
});

/** Strips whitespace and trailing slashes so API paths can be appended. */
export function normalizeZulipSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, '');
}

export function truncateForZulip(content: string): string {
  if (content.length <= ZULIP_MAX_MESSAGE_LENGTH) return content;
  return `${content.slice(0, ZULIP_MAX_MESSAGE_LENGTH - 1)}…`;
}

async function readZulipResponse(response: Response) {
  const json: unknown = await response.json().catch(() => null);
  return zulipResponseSchema.safeParse(json);
}

/**
 * Sends a direct message from the bot to one Zulip user, addressed by email.
 * Never throws: a Zulip failure must not break the notification that caused it.
 */
export async function sendZulipDirectMessage({
  credentials,
  to,
  content,
}: {
  credentials: ZulipCredentials;
  to: string;
  content: string;
}): Promise<ZulipSendResult> {
  const body = new URLSearchParams({
    // "direct" needs Zulip 7+; "private" is accepted by every server version.
    type: 'private',
    to: JSON.stringify([to]),
    content: truncateForZulip(content),
  });
  const basicAuth = Buffer.from(
    `${credentials.botEmail}:${credentials.botApiKey}`,
  ).toString('base64');

  try {
    const response = await fetch(
      `${normalizeZulipSiteUrl(credentials.siteUrl)}/api/v1/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const parsed = await readZulipResponse(response);

    if (!response.ok || !parsed.success || parsed.data.result !== 'success') {
      const reason =
        parsed.success && parsed.data.msg
          ? parsed.data.msg
          : `HTTP ${response.status}`;
      logger.warn(`Zulip rejected direct message to ${to}: ${reason}`);
      return { sent: false, reason };
    }

    return { sent: true, messageId: parsed.data.id ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to send Zulip direct message to ${to}: ${reason}`);
    return { sent: false, reason };
  }
}
