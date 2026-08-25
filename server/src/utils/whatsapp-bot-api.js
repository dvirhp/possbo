/**
 * WhatsApp Cloud API service — sends messages via Meta's Graph API
 */
import { createLogger } from "./logger.js";

const log = createLogger("whatsapp-bot-api");

const GRAPH_API_URL = "https://graph.facebook.com/v21.0";
const REQUEST_TIMEOUT_MS = 15_000;
const RLM = "\u200F";

function removeDisplayDashes(value) {
  const protectedTokens =
    /(https?:\/\/[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{4}-\d{2}-\d{2}\b)/gi;
  return String(value ?? "")
    .split(protectedTokens)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/[-–—]/g, " ").replace(/[ \t]{2,}/g, " "),
    )
    .join("");
}

function formatRtl(value) {
  return removeDisplayDashes(value)
    .split("\n")
    .map((line) => (line ? `${RLM}${line}` : line))
    .join("\n");
}

function getConfig() {
  return {
    phoneNumberId: process.env.WA_BOT_PHONE_NUMBER_ID,
    accessToken: process.env.WA_BOT_ACCESS_TOKEN,
  };
}

/**
 * Send a text message
 */
export async function sendText(to, text) {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: formatRtl(text) },
  };

  const res = await fetch(url, {
    method: "POST",
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Failed to send text", { to, error: err });
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return res.json();
}

/**
 * Send an image by a public URL or an existing WhatsApp media ID.
 */
export async function sendImage(to, { link, id, caption } = {}) {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
  const image = link ? { link } : { id };
  if (caption) image.caption = formatRtl(caption);

  const res = await fetch(url, {
    method: "POST",
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Failed to send image", { to, error: err });
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return res.json();
}

/**
 * Send an interactive message with buttons (max 3 buttons)
 */
export async function sendButtons(to, bodyText, buttons) {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: formatRtl(bodyText) },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: "reply",
          reply: {
            id: btn.id || `btn_${i}`,
            title: removeDisplayDashes(btn.title).slice(0, 20),
          },
        })),
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Failed to send buttons", { to, error: err });
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return res.json();
}

/**
 * Send an interactive list message (max 10 items)
 */
export async function sendList(to, bodyText, buttonText, sections) {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: formatRtl(bodyText) },
      action: {
        button: removeDisplayDashes(buttonText).slice(0, 20),
        sections: sections.map((section) => ({
          ...section,
          title: removeDisplayDashes(section.title),
          rows: section.rows.map((row) => ({
            ...row,
            title: removeDisplayDashes(row.title),
            description: row.description
              ? removeDisplayDashes(row.description)
              : undefined,
          })),
        })),
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error("Failed to send list", { to, error: err });
    throw new Error(`WhatsApp API error: ${err}`);
  }

  return res.json();
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId) {
  const { phoneNumberId, accessToken } = getConfig();
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

  await fetch(url, {
    method: "POST",
    signal: globalThis.AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {});
}
