import { z } from "zod";

/** Present in FormData (any value) => checked; absent => unchecked. */
const checkbox = z.preprocess((v) => v !== undefined, z.boolean());

/** HTML date input gives "YYYY-MM-DD"; normalized to UTC midnight — SRS §9.2. */
const calendarDate = z
  .string()
  .min(1, { message: "validation.required" })
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const optionalCalendarDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((s) => (s ? new Date(`${s}T00:00:00.000Z`) : null));

/**
 * Reading fields are optional at the schema level — presence depends on
 * whether the account tracks readings, which isn't known until the
 * action fetches it — and cross-validated there (both bands required
 * together, current >= previous unless rollover). See
 * server/bill-actions.ts.
 */
export const utilityBillSchema = z
  .object({
    accountId: z.string().min(1, { message: "validation.required" }),
    periodFrom: calendarDate,
    periodTo: calendarDate,
    issueDate: optionalCalendarDate,
    dueDate: calendarDate,
    amount: z.coerce
      .number({ message: "validation.required" })
      .positive({ message: "validation.required" }),
    /** Both optional and both informational. An empty input posts "", which
     * z.coerce.number turns into 0 — so blanks are mapped to undefined
     * first, keeping "not stated on the bill" distinct from "stated as
     * zero". */
    taxAmount: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.coerce.number().min(0).optional()
    ),
    previousDebt: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.coerce.number().min(0).optional()
    ),
    paymentDate: optionalCalendarDate,
    invoiceNumber: z.string().max(100).optional().or(z.literal("")),
    notes: z.string().max(2000).optional().or(z.literal("")),
    /** Provenance only — see the InputMethod enum in the Prisma schema. */
    inputMethod: z.enum(["MANUAL", "OCR"]).default("MANUAL"),
    previousReadingHigh: z.coerce.number().min(0).optional(),
    currentReadingHigh: z.coerce.number().min(0).optional(),
    rolloverHigh: checkbox,
    previousReadingLow: z.coerce.number().min(0).optional(),
    currentReadingLow: z.coerce.number().min(0).optional(),
    rolloverLow: checkbox,
  })
  .refine((data) => data.periodTo >= data.periodFrom, {
    message: "utilities.bill.periodOrderError",
    path: ["periodTo"],
  });
export type UtilityBillInput = z.infer<typeof utilityBillSchema>;
