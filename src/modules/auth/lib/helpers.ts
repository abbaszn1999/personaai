import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { randomInt } from "crypto";

const resend = process.env.APP_RESEND_API_KEY
  ? new Resend(process.env.APP_RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@autommerce.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateCode(): string {
  return String(randomInt(100000, 999999));
}

export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<void> {
  if (!resend) {
    console.warn("[auth] RESEND not configured — skipping verification email");
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Verify your Autommerce account",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Use the following 6-digit code to verify your Autommerce account:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#71717a;font-size:14px">This code expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[auth] Failed to send verification email:", err);
  }
}

export async function sendResetEmail(
  email: string,
  code: string
): Promise<void> {
  if (!resend) {
    console.warn("[auth] RESEND not configured — skipping reset email");
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Reset your Autommerce password",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Reset your password</h2>
          <p>Use the following 6-digit code to reset your Autommerce password:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;padding:16px;background:#f4f4f5;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#71717a;font-size:14px">This code expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
          <p><a href="${APP_URL}/forgot-password">Click here to reset your password</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[auth] Failed to send reset email:", err);
  }
}

export async function sendWelcomeEmail(
  email: string,
  firstName?: string | null
): Promise<void> {
  if (!resend) {
    console.warn("[auth] RESEND not configured — skipping welcome email");
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Welcome to Autommerce!",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2>Welcome${firstName ? `, ${firstName}` : ""}!</h2>
          <p>Your Autommerce account is ready. Let's get started.</p>
          <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Go to Dashboard</a>
        </div>
      `,
    });
  } catch (err) {
    console.error("[auth] Failed to send welcome email:", err);
  }
}
