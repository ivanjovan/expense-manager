import { z } from "zod";
import { MIN_PASSWORD_LENGTH, isCommonPassword } from "@/shared/lib/passwords";

/**
 * Error messages here are i18n message *keys* (e.g. "validation.required"),
 * never pre-translated strings — the caller renders them with `t(key)` in
 * the user's own locale. See SRS §16.
 */

const emailSchema = z.email({ message: "validation.invalidEmail" });

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: "validation.passwordTooShort" })
  .refine((pw) => !isCommonPassword(pw), {
    message: "validation.passwordTooCommon",
  });

export const registerHouseholdSchema = z
  .object({
    householdName: z.string().min(1, { message: "validation.required" }),
    name: z.string().min(1, { message: "validation.required" }),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    currency: z.enum(["MKD", "EUR"]),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "validation.passwordsDontMatch",
    path: ["confirmPassword"],
  });
export type RegisterHouseholdInput = z.infer<typeof registerHouseholdSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "validation.required" }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["OWNER", "MEMBER"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    name: z.string().min(1, { message: "validation.required" }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "validation.passwordsDontMatch",
    path: ["confirmPassword"],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
