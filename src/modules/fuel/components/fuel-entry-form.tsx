"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createFuelEntry, updateFuelEntry } from "@/modules/fuel/server/fuel-entry-actions";
import { deriveFuelValue, type DerivedField } from "@/modules/fuel/domain/derivation";
import { DocumentScanner } from "@/modules/documents/components/document-scanner";
import { FieldScanMark, ScanNotices } from "@/modules/documents/components/scan-notices";
import { applyFuelExtraction, type FuelScanApplication } from "@/modules/documents/domain/apply";
import type { DocumentExtractionResult } from "@/modules/documents/schemas/extraction";
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
  /** Household currency — a scanned document in any other currency is
   * rejected rather than saved, since totals here are currency-blind. */
  householdCurrency: "MKD" | "EUR";
  /** False when no extraction provider is configured: the scan panel is
   * hidden entirely rather than shown as a button that always fails. */
  scanEnabled?: boolean;
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

export function FuelEntryForm({
  mode,
  vehicleId,
  entryId,
  householdCurrency,
  scanEnabled = false,
  defaultValues,
}: FuelEntryFormProps) {
  const t = useTranslations("fuel.entry");
  const tc = useTranslations("common");
  const td = useTranslations("documents.scan");
  const tv = useTranslations();
  const router = useRouter();

  const action =
    mode === "edit" ? updateFuelEntry.bind(null, entryId!) : createFuelEntry;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const [derivedField, setDerivedField] = React.useState<DerivedField>(
    defaultValues?.derivedField ?? "LITERS"
  );
  const [date, setDate] = React.useState(defaultValues?.date ?? todayIsoDate());
  const [fuelPrice, setFuelPrice] = React.useState(String(defaultValues?.fuelPrice ?? ""));
  const [liters, setLiters] = React.useState(String(defaultValues?.liters ?? ""));
  const [totalPaid, setTotalPaid] = React.useState(String(defaultValues?.totalPaid ?? ""));
  const [station, setStation] = React.useState(defaultValues?.station ?? "");
  const [notes, setNotes] = React.useState(defaultValues?.notes ?? "");

  const [isFullTank, setIsFullTank] = React.useState(defaultValues?.isFullTank ?? true);
  /**
   * A fill-up's full-tank flag decides whether its segment is usable for
   * consumption at all (SRS §10.4), and no receipt states it. On a manual
   * entry the default is a fair assumption the user is looking straight at;
   * after a scan it would be a value nobody chose, pre-ticked under a pile
   * of numbers that all came from the document. So a scan un-answers it.
   */
  const [isFullTankAnswered, setIsFullTankAnswered] = React.useState(true);

  const [scan, setScan] = React.useState<
    (FuelScanApplication & { provider: string; mismatch: boolean }) | null
  >(null);

  const showScanner = scanEnabled && mode === "create";

  function handleExtracted(result: DocumentExtractionResult) {
    if (result.extraction.documentType !== "FUEL_RECEIPT") {
      // Nothing to pre-fill, but the notice still has to appear — telling the
      // user their electricity bill was ignored beats silently doing nothing.
      setScan({
        ...applyFuelExtraction({ documentType: "FUEL_RECEIPT" }, householdCurrency),
        provider: result.provider,
        mismatch: true,
      });
      return;
    }

    const applied = applyFuelExtraction(result.extraction, householdCurrency);
    setScan({ ...applied, provider: result.provider, mismatch: result.mismatch });

    // Only overwrite fields the document actually produced; anything it
    // didn't read keeps whatever is already typed.
    if (applied.values.date) setDate(applied.values.date);
    if (applied.values.fuelPrice !== undefined) setFuelPrice(applied.values.fuelPrice);
    if (applied.values.liters !== undefined) setLiters(applied.values.liters);
    if (applied.values.totalPaid !== undefined) setTotalPaid(applied.values.totalPaid);
    if (applied.values.station) setStation(applied.values.station);
    if (applied.values.notes) setNotes(applied.values.notes);
    setDerivedField(applied.derivedField);
    setIsFullTankAnswered(false);
  }

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

  const blockedByCurrency = scan?.currencyMismatch ?? false;
  const submitDisabled = isPending || blockedByCurrency || !isFullTankAnswered;

  return (
    <div className="flex flex-col gap-4">
      {showScanner && (
        <DocumentScanner
          documentType="FUEL_RECEIPT"
          onExtracted={handleExtracted}
          disabled={isPending}
        />
      )}

      {scan && (
        <ScanNotices
          provider={scan.provider}
          mismatch={scan.mismatch}
          foreignCurrency={scan.currencyMismatch ? scan.currency : null}
          householdCurrency={householdCurrency}
          lowConfidenceFields={scan.lowConfidenceFields}
        />
      )}

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <input type="hidden" name="derivedField" value={derivedField} />
        <input type="hidden" name="inputMethod" value={scan ? "OCR" : "MANUAL"} />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="date">{t("date")}</Label>
              <FieldScanMark confidence={scan?.confidence.date} />
            </div>
            <Input
              id="date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
              autoFocus={scan !== null}
              defaultValue={defaultValues?.odometer}
            />
            {/* A receipt never prints the odometer, so after a scan this is
                the one field the user must still supply — said out loud
                rather than left as an empty box among filled ones. */}
            {scan && <p className="text-xs text-amber-600 dark:text-amber-500">{td("odometerNeeded")}</p>}
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="fuelPrice">{t("fuelPrice")}</Label>
              <FieldScanMark confidence={scan?.confidence.fuelPrice} />
            </div>
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="liters">{t("liters")}</Label>
              <FieldScanMark confidence={scan?.confidence.liters} />
            </div>
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="totalPaid">{t("totalPaid")}</Label>
              <FieldScanMark confidence={scan?.confidence.totalPaid} />
            </div>
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

        {isFullTankAnswered ? (
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                name="isFullTank"
                checked={isFullTank}
                onChange={(e) => setIsFullTank(e.target.checked)}
              />
              {t("isFullTank")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="missedEntries" defaultChecked={defaultValues?.missedEntries ?? false} />
              {t("missedEntries")}
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">{td("fullTankQuestion")}</p>
            <p className="text-xs text-muted-foreground">{td("fullTankWhy")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  setIsFullTank(true);
                  setIsFullTankAnswered(true);
                }}
              >
                {td("fullTankYes")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsFullTank(false);
                  setIsFullTankAnswered(true);
                }}
              >
                {td("fullTankNo")}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="station">{t("station")}</Label>
              <FieldScanMark confidence={scan?.confidence.station} />
            </div>
            <Input
              id="station"
              name="station"
              value={station}
              onChange={(e) => setStation(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
          <Button type="submit" disabled={submitDisabled}>
            {t("submit")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
