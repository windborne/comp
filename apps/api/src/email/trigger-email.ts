import { render } from '@react-email/render';
import { tasks } from '@trigger.dev/sdk';
import type { ReactElement } from 'react';
import type { EmailChannel, sendEmailTask } from '../trigger/email/send-email';
import type { EmailAttachment } from './resend';
import { isSmtpConfigured, sendEmailViaSmtp } from './smtp';

type TriggerEmailFlags = {
  marketing?: boolean;
  system?: boolean;
  trustPortal?: boolean;
};

function resolveChannel(flags: TriggerEmailFlags): EmailChannel {
  if (flags.trustPortal) return 'trustPortal';
  if (flags.marketing) return 'marketing';
  if (flags.system) return 'system';
  return 'default';
}

/**
 * Send a transactional email.
 *
 * Delivery transport is chosen at runtime:
 *   1. Trigger.dev worker (`TRIGGER_SECRET_KEY`) — the hosted default; the
 *      `send-email` task delivers via Resend.
 *   2. Direct SMTP (`SMTP_HOST`) — for self-hosted installs with no Trigger.dev
 *      worker. This keeps email-based auth (magic link / OTP), invites, and
 *      notifications working without Trigger.dev or Resend.
 *
 * If neither is configured, this throws so the caller surfaces a clear error
 * instead of silently dropping the email.
 */
export async function triggerEmail(params: {
  to: string;
  subject: string;
  react: ReactElement;
  marketing?: boolean;
  system?: boolean;
  trustPortal?: boolean;
  cc?: string | string[];
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}): Promise<{ id: string }> {
  try {
    const html = await render(params.react);
    const channel = resolveChannel(params);

    // 1. Hosted default: hand off to the Trigger.dev worker (delivers via Resend).
    if (process.env.TRIGGER_SECRET_KEY) {
      const handle = await tasks.trigger<typeof sendEmailTask>('send-email', {
        to: params.to,
        subject: params.subject,
        html,
        channel,
        cc: params.cc,
        scheduledAt: params.scheduledAt,
        attachments: params.attachments?.map((att) => ({
          filename: att.filename,
          content:
            typeof att.content === 'string'
              ? att.content
              : att.content.toString('base64'),
          contentType: att.contentType,
        })),
      });

      return { id: handle.id };
    }

    // 2. Self-hosted without a Trigger.dev worker: deliver directly over SMTP.
    if (isSmtpConfigured()) {
      return await sendEmailViaSmtp({
        to: params.to,
        subject: params.subject,
        html,
        channel,
        cc: params.cc,
        attachments: params.attachments,
      });
    }

    throw new Error(
      'No email transport configured. Set TRIGGER_SECRET_KEY (Trigger.dev worker) or SMTP_HOST (direct SMTP).',
    );
  } catch (error) {
    console.error('[triggerEmail] Failed to send email', {
      to: params.to,
      subject: params.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
