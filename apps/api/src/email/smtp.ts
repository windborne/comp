import nodemailer from 'nodemailer';
import type { EmailChannel } from '../trigger/email/send-email';
import type { EmailAttachment } from './resend';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let cachedTransporter: Transporter | null = null;

/**
 * True when SMTP delivery is configured. Used by `triggerEmail` to deliver
 * mail directly when no Trigger.dev worker is available (self-hosted installs).
 */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error('SMTP not configured - missing SMTP_HOST');
  }

  const port = Number(process.env.SMTP_PORT ?? '587');
  // Port 465 is implicit TLS; 587/25 upgrade via STARTTLS. SMTP_SECURE overrides.
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : port === 465;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  // Only authenticate when both are present; some relays accept unauthenticated
  // submission from allowlisted hosts.
  const auth = user && pass ? { user, pass } : undefined;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });

  return cachedTransporter;
}

/**
 * Resolve the From address for a channel, mirroring the Resend channel split
 * (see `resolveFromAddressForChannel` in trigger/email/send-email.ts). Every
 * channel falls back to `SMTP_FROM`, so a single address is enough to start.
 */
function resolveFromAddress(channel: EmailChannel | undefined): string | undefined {
  const fallback = process.env.SMTP_FROM;
  const system = process.env.SMTP_FROM_SYSTEM ?? fallback;
  const marketing = process.env.SMTP_FROM_MARKETING ?? fallback;
  const trustPortal = process.env.SMTP_FROM_TRUST_PORTAL ?? system;

  switch (channel) {
    case 'marketing':
      return marketing;
    case 'trustPortal':
      return trustPortal;
    case 'system':
      return system;
    default:
      return fallback;
  }
}

/**
 * Deliver an already-rendered email directly over SMTP, without a Trigger.dev
 * worker. `scheduledAt` is not supported over SMTP; callers that need scheduled
 * sends should use the Trigger.dev/Resend path instead.
 */
export async function sendEmailViaSmtp({
  to,
  subject,
  html,
  channel,
  cc,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  channel?: EmailChannel;
  cc?: string | string[];
  attachments?: EmailAttachment[];
}): Promise<{ id: string }> {
  const from = resolveFromAddress(channel);
  if (!from) {
    throw new Error('SMTP not configured - missing SMTP_FROM address');
  }

  const info = await getTransporter().sendMail({
    from,
    to,
    cc,
    subject,
    html,
    attachments: attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });

  return { id: info.messageId };
}
