import { z } from "zod";

/**
 * MVP scope is electricity only (SRS §11), confirmed dual-tariff with
 * meter readings on the bill — so the form doesn't ask the user to choose
 * utility type, tracking mode, or unit; the account is created with those
 * fixed (ELECTRICITY / tracksReadings=true / KWH). Water, gas, internet,
 * mobile reuse this same account shape later without a schema change.
 */
export const utilityAccountSchema = z.object({
  name: z.string().min(1, { message: "validation.required" }).max(100),
  provider: z.string().max(100).optional().or(z.literal("")),
  accountNumber: z.string().max(100).optional().or(z.literal("")),
  meterNumber: z.string().max(100).optional().or(z.literal("")),
});
export type UtilityAccountInput = z.infer<typeof utilityAccountSchema>;
