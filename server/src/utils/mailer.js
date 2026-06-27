import nodemailer from "nodemailer";
import { createLogger } from "./logger.js";

const log = createLogger("mailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a verification code email
 */
export async function sendVerificationEmail(to, code) {
  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #1c1f26; border-radius: 16px; color: #e8ecf0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #818cf8; margin: 0; font-size: 28px;">📌 PostIt</h1>
      </div>
      <h2 style="text-align: center; color: #e8ecf0; font-size: 18px;">קוד האימות שלך</h2>
      <div style="background: #23272f; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #818cf8;">${code}</span>
      </div>
      <p style="text-align: center; color: #a3adb8; font-size: 14px;">הקוד תקף ל-10 דקות בלבד.</p>
      <p style="text-align: center; color: #6b7684; font-size: 12px; margin-top: 32px;">אם לא ביקשת את הקוד הזה, ניתן להתעלם מהמייל.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"PostIt" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - קוד אימות PostIt`,
      html,
    });
    log.info(`Verification email sent to ${to}`);
    return true;
  } catch (error) {
    log.error("Failed to send email", error);
    return false;
  }
}

/**
 * Send a password reset verification code
 */
export async function sendPasswordResetEmail(to, code) {
  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #1c1f26; border-radius: 16px; color: #e8ecf0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #818cf8; margin: 0; font-size: 28px;">📌 PostIt</h1>
      </div>
      <h2 style="text-align: center; color: #e8ecf0; font-size: 18px;">קוד לשינוי סיסמה</h2>
      <div style="background: #23272f; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #818cf8;">${code}</span>
      </div>
      <p style="text-align: center; color: #a3adb8; font-size: 14px;">הקוד תקף ל-10 דקות. אם לא ביקשת שינוי סיסמה — התעלם.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"PostIt" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - שינוי סיסמה PostIt`,
      html,
    });
    log.info(`Password reset email sent to ${to}`);
    return true;
  } catch (error) {
    log.error("Failed to send password reset email", error);
    return false;
  }
}

/**
 * Generate a 6-digit verification code
 */
export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
