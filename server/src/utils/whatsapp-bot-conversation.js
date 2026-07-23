/**
 * WhatsApp Bot conversation state manager
 * Stores conversation state in-memory with TTL (for MVP/sandbox)
 * In production, replace with Redis
 */

// Map<phoneNumber, { userId, step, intent, context, expiresAt }>
const conversations = new Map();

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get conversation state for a phone number
 */
export function getConversation(phoneNumber) {
  const conv = conversations.get(phoneNumber);
  if (!conv) return null;
  if (conv.expiresAt < Date.now()) {
    conversations.delete(phoneNumber);
    return null;
  }
  return conv;
}

/**
 * Set/update conversation state
 */
export function setConversation(phoneNumber, data) {
  const existing = conversations.get(phoneNumber) || {};
  conversations.set(phoneNumber, {
    ...existing,
    ...data,
    expiresAt: Date.now() + SESSION_TTL,
  });
}

/**
 * Clear conversation state
 */
export function clearConversation(phoneNumber) {
  conversations.delete(phoneNumber);
}

/**
 * Get authenticated userId for a phone number
 */
export function getAuthenticatedUser(phoneNumber) {
  const conv = getConversation(phoneNumber);
  if (!conv || !conv.userId) return null;
  return conv.userId;
}

// OTP storage: Map<phoneNumber, { code, userId, email, expiresAt, attempts }>
const pendingOTPs = new Map();

/**
 * Store a pending OTP for phone verification
 */
export function storePendingOTP(phoneNumber, userId, email, code) {
  pendingOTPs.set(phoneNumber, {
    code,
    userId,
    email,
    attempts: 0,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Verify OTP and return userId if valid
 */
export function verifyOTP(phoneNumber, inputCode) {
  const pending = pendingOTPs.get(phoneNumber);
  if (!pending) return null;

  if (pending.expiresAt < Date.now()) {
    pendingOTPs.delete(phoneNumber);
    return null;
  }

  pending.attempts += 1;
  if (pending.attempts > 5) {
    pendingOTPs.delete(phoneNumber);
    return null;
  }

  if (pending.code !== inputCode.trim()) {
    return null;
  }

  // Valid!
  pendingOTPs.delete(phoneNumber);
  return { userId: pending.userId, email: pending.email };
}

// Cleanup expired entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, val] of conversations) {
      if (val.expiresAt < now) conversations.delete(key);
    }
    for (const [key, val] of pendingOTPs) {
      if (val.expiresAt < now) pendingOTPs.delete(key);
    }
  },
  5 * 60 * 1000,
);
