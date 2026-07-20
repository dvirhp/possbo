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
 * Build a light-mode HTML email wrapper that forces light appearance
 * even on clients with dark mode enabled.
 */
function buildEmailHtml({ title, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
    @media (prefers-color-scheme: dark) {
      body, .email-body { background-color: #ffffff !important; color: #1a1a2e !important; }
    }
    body { margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-spacing: 0; border-collapse: collapse; }
    img { border: 0; display: block; }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; background-color: #f4f6f9; direction: rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">📌 PostIt</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; border-top: 1px solid #eef0f4; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} PostIt. כל הזכויות שמורות.</p>
              <p style="margin: 6px 0 0; font-size: 11px; color: #c0c7d1;">המייל הזה נשלח מ-PostIt. אם לא ביקשת אותו — ניתן להתעלם.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a verification code email
 */
export async function sendVerificationEmail(to, code) {
  const bodyContent = `
    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #1a1a2e; text-align: center;">קוד האימות שלך</h2>
    <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; text-align: center;">הזן את הקוד הבא כדי לאמת את חשבונך</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <div style="background-color: #f0f0ff; border: 2px solid #e0e0ff; border-radius: 12px; padding: 20px 32px; display: inline-block;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #6366f1; font-family: 'Courier New', monospace;">${code}</span>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280; text-align: center;">⏱️ הקוד תקף ל-10 דקות בלבד.</p>
  `;

  const html = buildEmailHtml({ title: "קוד אימות - PostIt", bodyContent });
  const text = `קוד האימות שלך ב-PostIt: ${code}\nהקוד תקף ל-10 דקות.`;

  try {
    await transporter.sendMail({
      from: `"PostIt" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - קוד אימות PostIt`,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<mailto:${process.env.SMTP_USER}?subject=unsubscribe>`,
        "X-Priority": "1",
      },
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
  const bodyContent = `
    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #1a1a2e; text-align: center;">שינוי סיסמה</h2>
    <p style="margin: 0 0 24px; font-size: 14px; color: #6b7280; text-align: center;">הזן את הקוד הבא כדי לאפס את הסיסמה שלך</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <div style="background-color: #f0f0ff; border: 2px solid #e0e0ff; border-radius: 12px; padding: 20px 32px; display: inline-block;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #6366f1; font-family: 'Courier New', monospace;">${code}</span>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280; text-align: center;">⏱️ הקוד תקף ל-10 דקות. אם לא ביקשת שינוי סיסמה — התעלם.</p>
  `;

  const html = buildEmailHtml({ title: "שינוי סיסמה - PostIt", bodyContent });
  const text = `קוד לשינוי סיסמה ב-PostIt: ${code}\nהקוד תקף ל-10 דקות. אם לא ביקשת — התעלם.`;

  try {
    await transporter.sendMail({
      from: `"PostIt" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - שינוי סיסמה PostIt`,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<mailto:${process.env.SMTP_USER}?subject=unsubscribe>`,
        "X-Priority": "1",
      },
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

/**
 * Send feedback email to the site admin
 */
export async function sendFeedbackEmail({
  userName,
  userEmail,
  features,
  answers,
  prompt,
}) {
  const questionLabels = {
    favorite: "מה הכי אהבת?",
    leastFavorite: "מה הכי פחות אהבת?",
    searchFeedback: "מה דעתך על החיפוש?",
    jobScreenFeedback: "מסך משרה – מה היית רוצה לשנות או לשפר?",
    missingFree: "מה חסר לך היום בגרסה החינמית?",
    upgradeTrigger: "מה היה גורם לך לשדרג למנוי פרימיום?",
  };

  const answersHtml = Object.entries(answers)
    .filter(([, v]) => v && v.trim())
    .map(
      ([k, v]) => `
      <tr><td style="padding:8px 12px;font-weight:600;color:#6366f1;vertical-align:top;white-space:nowrap;">${questionLabels[k] || k}</td></tr>
      <tr><td style="padding:4px 12px 16px;color:#1a1a2e;">${v.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>
    `,
    )
    .join("");

  const bodyContent = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a2e;text-align:center;">📝 פידבק חדש</h2>
    <table role="presentation" width="100%" style="margin-bottom:16px;">
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>משתמש:</strong> ${userName.replace(/</g, "&lt;")} (${userEmail})</td></tr>
    </table>
    ${
      features.length > 0
        ? `
    <div style="padding:8px 12px;margin-bottom:16px;">
      <strong style="color:#6366f1;font-size:14px;">פיצ׳רים שנוסו:</strong><br/>
      <span style="font-size:13px;color:#1a1a2e;">${features.map((f) => f.replace(/</g, "&lt;")).join(", ")}</span>
    </div>`
        : ""
    }
    <table role="presentation" width="100%">
      ${answersHtml}
    </table>
    ${
      prompt.trim()
        ? `
    <div style="padding:12px;margin-top:8px;background:#f0f0ff;border-radius:8px;">
      <strong style="color:#6366f1;font-size:14px;">פרומפט מוצע:</strong>
      <p style="margin:8px 0 0;font-size:13px;color:#1a1a2e;white-space:pre-wrap;">${prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>`
        : ""
    }
  `;

  const html = buildEmailHtml({ title: "פידבק חדש - PostIt", bodyContent });

  const textParts = [`פידבק חדש מ-${userName} (${userEmail})`];
  if (features.length > 0) textParts.push(`פיצ'רים: ${features.join(", ")}`);
  Object.entries(answers)
    .filter(([, v]) => v?.trim())
    .forEach(([k, v]) => {
      textParts.push(`${questionLabels[k] || k}: ${v}`);
    });
  if (prompt.trim()) textParts.push(`פרומפט: ${prompt}`);

  try {
    await transporter.sendMail({
      from: `"PostIt Feedback" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: userEmail,
      subject: `📝 פידבק חדש מ-${userName}`,
      html,
      text: textParts.join("\n\n"),
    });
    log.info(`Feedback email sent from ${userEmail}`);
    return true;
  } catch (error) {
    log.error("Failed to send feedback email", error);
    throw error;
  }
}
