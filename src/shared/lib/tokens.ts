import { randomBytes, createHash } from "node:crypto";

/**
 * Invitation and password-reset tokens: generate a random value, return it
 * once (for the email/link), and store only its SHA-256 hash. See SRS §6.2.
 */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
