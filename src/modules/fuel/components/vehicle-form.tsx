"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createVehicle, updateVehicle } from "@/modules/fuel/server/vehicle-actions";
import { FUEL_TYPES } from "@/modules/fuel/schemas/vehicle";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";

interface VehicleFormProps {
  mode: "create" | "edit";
  vehicleId?: string;
  defaultValues?: {
    name: string;
    manufacturer: string | null;
    model: string | null;
    fuelType: (typeof FUEL_TYPES)[number];
    licensePlate: string | null;
    initialOdometer: number;
    notes: string | null;
  };
}

function FieldError({ message }: { message: string | undefined }) {
  const tv = useTranslations();
  if (!message) return null;
  return <p className="text-sm text-destructive">{translateDynamic(tv, message)}</p>;
}

export function VehicleForm({ mode, vehicleId, defaultValues }: VehicleFormProps) {
  const t = useTranslations("fuel.vehicles");
  const tc = useTranslations("common");
  const tv = useTranslations();
  const router = useRouter();

  const action = mode === "edit" ? updateVehicle.bind(null, vehicleId!) : createVehicle;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/vehicles/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required defaultValue={defaultValues?.name} />
        <FieldError message={fieldErrors?.name} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manufacturer">{t("manufacturer")}</Label>
          <Input
            id="manufacturer"
            name="manufacturer"
            defaultValue={defaultValues?.manufacturer ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="model">{t("model")}</Label>
          <Input id="model" name="model" defaultValue={defaultValues?.model ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fuelType">{t("fuelType")}</Label>
          <Select id="fuelType" name="fuelType" defaultValue={defaultValues?.fuelType ?? "PETROL"} required>
            {FUEL_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {t(`fuelTypes.${ft}`)}
              </option>
            ))}
          </Select>
          <FieldError message={fieldErrors?.fuelType} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="licensePlate">{t("licensePlate")}</Label>
          <Input
            id="licensePlate"
            name="licensePlate"
            defaultValue={defaultValues?.licensePlate ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="initialOdometer">{t("initialOdometer")}</Label>
        <Input
          id="initialOdometer"
          name="initialOdometer"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={defaultValues?.initialOdometer ?? 0}
        />
        <FieldError message={fieldErrors?.initialOdometer} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes ?? ""} />
      </div>

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {translateDynamic(tv, state.error)}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
