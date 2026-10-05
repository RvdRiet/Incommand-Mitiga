import nodemailer from "nodemailer";

/**
 * Email delivery. Transport is chosen by EMAIL_TRANSPORT:
 *   • "console" (default) — logs the message + links to the server console. Lets
 *     the invite/reset flows work end-to-end in dev with zero email infra.
 *   • "smtp" — real delivery via SMTP_* env (host/port/user/pass). Point this at
 *     SES/Postmark/Sendgrid/etc. in production.
 */
export type Mail = { to: string; subject: string; text: string; html?: string };

function appUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

const FROM = process.env.EMAIL_FROM ?? "InCommand <no-reply@incommand.local>";

let smtp: nodemailer.Transporter | null = null;
function smtpTransport(): nodemailer.Transporter {
  if (smtp) return smtp;
  smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return smtp;
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = process.env.EMAIL_TRANSPORT ?? "console";
  if (transport === "smtp") {
    await smtpTransport().sendMail({ from: FROM, ...mail });
    return;
  }
  // console transport
  console.log(
    `\n[email:console] to=${mail.to}\n  subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, "\n  ")}\n`,
  );
}

// --- templated helpers -----------------------------------------------------

export async function sendInviteEmail(params: {
  to: string;
  tenantName: string;
  inviterName?: string | null;
  token: string;
}): Promise<string> {
  const link = `${appUrl()}/accept-invite?token=${encodeURIComponent(params.token)}`;
  const by = params.inviterName ? ` by ${params.inviterName}` : "";
  await sendMail({
    to: params.to,
    subject: `You've been invited to InCommand — ${params.tenantName}`,
    text: `You were invited${by} to join ${params.tenantName} on InCommand.\n\nSet your password and finish setup:\n${link}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
  });
  return link;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  tenantName: string;
  token: string;
}): Promise<string> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(params.token)}`;
  await sendMail({
    to: params.to,
    subject: `Reset your InCommand password — ${params.tenantName}`,
    text: `A password reset was requested for your ${params.tenantName} account.\n\nReset it here (expires in 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
  });
  return link;
}
