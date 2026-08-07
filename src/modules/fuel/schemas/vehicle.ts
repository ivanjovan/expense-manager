import { z } from "zod";

export const FUEL_TYPES = [
  "PETROL",
  "DIESEL",
  "LPG",
  "CNG",
  "ELECTRIC",
  "HYBRID",
] as const;

export const vehicleSchema = z.object({
  name: z.string().min(1, { message: "validation.required" }).max(100),
  manufacturer: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(100).optional().or(z.literal("")),
  fuelType: z.enum(FUEL_TYPES, { message: "validation.required" }),
  licensePlate: z.string().max(20).optional().or(z.literal("")),
  initialOdometer: z.coerce
    .number({ message: "validation.required" })
    .int()
    .min(0, { message: "validation.required" })
    .default(0),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;
