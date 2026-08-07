import { z } from "zod";

/**
 * All environment variables the app depends on, validated once at import
 * time. Per SRS §18, the app should refuse to boot with an invalid or
 * incomplete configuration rather than fail confusingly at first request.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.url().optional(),
  ALLOW_PUBLIC_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Document scanning (optional — the app runs fully without it; the scan
  // entry points are simply hidden when no key is configured).
  DOCUMENT_EXTRACTION_PROVIDER: z.enum(["claude"]).default("claude"),
  DOCUMENT_EXTRACTION_API_KEY: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:\n" +
      JSON.stringify(z.treeifyError(parsed.error), null, 2)
  );
  throw new Error(
    "Invalid environment configuration — see the errors logged above. Check .env against .env.example."
  );
}

export const env = parsed.data;

export const smtpConfigured = Boolean(
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
);
