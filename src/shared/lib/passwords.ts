import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A real bcrypt hash at the same cost factor, of a passphrase no account
 * has. Compared against when the submitted email matches no user, so that
 * "no such account" costs the same wall-clock time as "wrong password" —
 * see the call site in auth.ts. Always resolves false; the result is
 * discarded, only the work matters.
 *
 * A constant rather than a hash generated at boot: generating one would put
 * a cost-12 hash on the startup path of every process, and there is nothing
 * secret about this value.
 */
const DECOY_HASH = "$2b$12$NUkIvVALXCtRxwl3JMwDtOqsyhHVo19ePH/WqdWu9zvpLs48/JH8.";

export async function dummyPasswordCompare(password: string): Promise<void> {
  await bcrypt.compare(password, DECOY_HASH);
}

export const MIN_PASSWORD_LENGTH = 10;

/**
 * A starter list, not an exhaustive one — swap in a proper corpus
 * (e.g. the top 10k from Have I Been Pwned's password list) before this
 * ever faces the public internet. The point for Phase 0 is that the check
 * exists and is easy to extend, per SRS §6.3.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "admin1234",
  "iloveyou1",
  "sunshine1",
  "princess1",
  "football1",
  "baseball1",
  "dragon123",
  "monkey123",
  "trustno1x",
  "abc123456",
  "changeme1",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
