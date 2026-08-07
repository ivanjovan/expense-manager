"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createFuelEntry, updateFuelEntry } from "@/modules/fuel/server/fuel-entry-actions";
import { deriveFuelValue, type DerivedField } from "@/modules/fuel/domain/derivation";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";

interface FuelEntryFormProps {
  mode: "create" | "edit";
  vehicleId: string;
  entryId?: string;
  defaultValues?: {
    date: string; // "YYYY-MM-DD"
    odometer: number;
    fuelPrice: number;
    liters: number;
    totalPaid: number;
    derivedField: DerivedField;
    isFullTank: boolean;
    missedEntries: boolean;
    station: string | null;
    notes: string | null;
  };
}

function FieldError({ message }: { message: string | undefined }) {
  const tv = useTranslations();
  if (!message) return null;
  return <p className="text-sm text-destructive">{translateDynamic(tv, message)}</p>;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FuelEntryForm({ mode, vehicleId, entryId, defaultValues }: FuelEntryFormProps) {
  const t = useTranslations("fuel.entry");
  const tc = useTranslations("common");
  const tv = useTranslations();
  const router = useRouter();

  const action =
    mode === "edit" ? updateFuelEntry.bind(null, entryId!) : createFuelEntry;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const [derivedField, setDerivedField] = React.useState<DerivedField>(
    defaultValues?.derivedField ?? "LITERS"
  );
  const [fuelPrice, setFuelPrice] = React.useState(String(defaultValues?.fuelPrice ?? ""));
  const [liters, setLiters] = React.useState(String(defaultValues?.liters ?? ""));
  const [totalPaid, setTotalPaid] = React.useState(String(defaultValues?.totalPaid ?? ""));

  function recompute(nextDerivedField: DerivedField, values: { fuelPrice: string; liters: string; totalPaid: string }) {
    if (nextDerivedField === "NONE") return;
    const numeric = {
      fuelPrice: Number(values.fuelPrice) || 0,
      liters: Number(values.liters) || 0,
      totalPaid: Number(values.totalPaid) || 0,
    };
    const computed = deriveFuelValue(numeric, nextDerivedField);
    const rounded = Math.round(computed * 1000) / 1000;
    if (nextDerivedField === "FUEL_PRICE") setFuelPrice(String(rounded));
    else if (nextDerivedField === "LITERS") setLiters(String(rounded));
    else setTotalPaid(String(rounded));
  }

  function handleDerivedFieldChange(next: DerivedField) {
    setDerivedField(next);
    recompute(next, { fuelPrice, liters, totalPaid });
  }

  function handleValueChange(field: "fuelPrice" | "liters" | "totalPaid", value: string) {
    const next = { fuelPrice, liters, totalPaid, [field]: value };
    if (field === "fuelPrice") setFuelPrice(value);
    else if (field === "liters") setLiters(value);
    else setTotalPaid(value);
    if (derivedField !== "NONE" && derivedField !== fieldToDerivedField(field)) {
      recompute(derivedField, next);
    }
  }

  function fieldToDerivedField(field: "fuelPrice" | "liters" | "totalPaid"): DerivedField {
    if (field === "fuelPrice") return "FUEL_PRICE";
    if (field === "liters") return "LITERS";
    return "TOTAL_PAID";
  }

  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/vehicles/${vehicleId}`);
    }
  }, [state, router, vehicleId]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="derivedField" value={derivedField} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">{t("date")}</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={defaultValues?.date ?? todayIsoDate()}
          />
          <FieldError message={fieldErrors?.date} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="odometer">{t("odometer")}</Label>
          <Input
            id="odometer"
            name="odometer"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            defaultValue={defaultValues?.odometer}
          />
          <FieldError message={fieldErrors?.odometer} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="derivedFieldSelect">{t("chooseDerivedHint")}</Label>
        <Select
          id="derivedFieldSelect"
          value={derivedField}
          onChange={(e) => handleDerivedFieldChange(e.target.value as DerivedField)}
        >
          <option value="TOTAL_PAID">{t("totalPaid")}</option>
          <option value="LITERS">{t("liters")}</option>
          <option value="FUEL_PRICE">{t("fuelPrice")}</option>
          <option value="NONE">{t("noneOption")}</option>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fuelPrice">{t("fuelPrice")}</Label>
          <Input
            id="fuelPrice"
            name="fuelPrice"
            type="number"
            inputMode="decimal"
            step="0.001"
            min={0}
            required
            readOnly={derivedField === "FUEL_PRICE"}
            className={derivedField === "FUEL_PRICE" ? "bg-muted" : undefined}
            value={fuelPrice}
            onChange={(e) => handleValueChange("fuelPrice", e.target.value)}
          />
          <FieldError message={fieldErrors?.fuelPrice} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="liters">{t("liters")}</Label>
          <Input
            id="liters"
            name="liters"
            type="number"
            inputMode="decimal"
            step="0.001"
            min={0}
            required
            readOnly={derivedField === "LITERS"}
            className={derivedField === "LITERS" ? "bg-muted" : undefined}
            value={liters}
            onChange={(e) => handleValueChange("liters", e.target.value)}
          />
          <FieldError message={fieldErrors?.liters} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="totalPaid">{t("totalPaid")}</Label>
          <Input
            id="totalPaid"
            name="totalPaid"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            readOnly={derivedField === "TOTAL_PAID"}
            className={derivedField === "TOTAL_PAID" ? "bg-muted" : undefined}
            value={totalPaid}
            onChange={(e) => handleValueChange("totalPaid", e.target.value)}
          />
          <FieldError message={fieldErrors?.totalPaid} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{t("derivedHint")}</p>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isFullTank" defaultChecked={defaultValues?.isFullTank ?? true} />
          {t("isFullTank")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="missedEntries" defaultChecked={defaultValues?.missedEntries ?? false} />
          {t("missedEntries")}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="station">{t("station")}</Label>
          <Input id="station" name="station" defaultValue={defaultValues?.station ?? ""} />
        </div>
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
      {state?.ok && state.data.warning && (
        <p role="status" className="text-sm text-amber-600 dark:text-amber-500">
          {translateDynamic(tv, state.data.warning)}
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
