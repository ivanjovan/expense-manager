import { z } from "zod";

const DERIVED_FIELDS = ["NONE", "FUEL_PRICE", "LITERS", "TOTAL_PAID"] as const;

/** Present in FormData (any value) => checked; absent => unchecked. */
const checkbox = z.preprocess((v) => v !== undefined, z.boolean());

/** HTML date input gives "YYYY-MM-DD"; normalized to UTC midnight so the
 * calendar date it represents can't shift by timezone — SRS §9.2. */
const calendarDate = z
  .string()
  .min(1, { message: "validation.required" })
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const fuelEntrySchema = z.object({
  vehicleId: z.string().min(1, { message: "validation.required" }),
  date: calendarDate,
  odometer: z.coerce
    .number({ message: "validation.required" })
    .int()
    .min(0, { message: "validation.required" }),
  fuelPrice: z.coerce.number({ message: "validation.required" }).positive({ message: "validation.required" }),
  liters: z.coerce.number({ message: "validation.required" }).positive({ message: "validation.required" }),
  totalPaid: z.coerce.number({ message: "validation.required" }).positive({ message: "validation.required" }),
  derivedField: z.enum(DERIVED_FIELDS).default("NONE"),
  /** Provenance only — see the InputMethod enum in the Prisma schema. Never
   * affects validation: a scanned entry is reviewed by a human before it
   * gets here, so it earns no less trust than a typed one. */
  inputMethod: z.enum(["MANUAL", "OCR"]).default("MANUAL"),
  isFullTank: checkbox,
  missedEntries: checkbox,
  station: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type FuelEntryInput = z.infer<typeof fuelEntrySchema>;
