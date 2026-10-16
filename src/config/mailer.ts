import dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Transactional email over HTTPS (Brevo API).
 *
 * SMTP is intentionally not used: Render's free web services block outbound
 * traffic on SMTP ports 25/465/587, so SMTP connections hang until they time
 * out. An HTTPS API call works on every plan.
 *
 * All email in the app goes through sendMail(), so swapping providers later
 * only means changing this file.
 */
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Fail fast instead of letting a slow provider hold a request open.
const SEND_TIMEOUT_MS = 10_000;

/**
 * Splits MAIL_FROM into the { name, email } shape the provider expects.
 * Accepts either "someone@example.com" or "Progress <someone@example.com>".
 */
const parseSender = (from: string) => {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  if (match) {
    const name = match[1].replace(/^"|"$/g, "");
    return name ? { name, email: match[2] } : { email: match[2] };
  }

  return { email: from.trim() };
};

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendMail = async ({ to, subject, html }: MailOptions) => {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured.");
  }
  if (!from) {
    throw new Error("MAIL_FROM is not configured.");
  }

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Email provider responded with ${response.status}: ${detail}`,
    );
  }
};
