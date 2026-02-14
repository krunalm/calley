import { Resend } from 'resend';

import { logger } from './logger';

// ─── Client Setup ────────────────────────────────────────────────────

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || 'Calley <noreply@calley.app>';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// ─── Send Email ──────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send an email via Resend. In development (no API key), logs to console.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!resend) {
    logger.info(
      {
        to: options.to,
        subject: options.subject,
        text: options.text,
      },
      'Email (dev mode — no RESEND_API_KEY): would send email',
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: emailFrom,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  if (error) {
    logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
    throw new Error(`Failed to send email: ${error.message}`);
  }

  logger.info({ to: options.to, subject: options.subject }, 'Email sent');
}
