/**
 * WhatsApp Cloud API service — sends messages via Meta's Graph API
 */
import { createLogger } from "./logger.js";

const log = createLogger("whatsapp-bot-api");

const GRAPH_API_URL = "https://graph.facebook.com/v21.0";

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
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
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
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, i) => ({
          type: "reply",
          reply: { id: btn.id || `btn_${i}`, title: btn.title.slice(0, 20) },
        })),
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
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
      body: { text: bodyText },
      action: {
        button: buttonText.slice(0, 20),
        sections,
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
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
