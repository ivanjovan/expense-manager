"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createUtilityBill, updateUtilityBill } from "@/modules/utilities/server/bill-actions";
import { DocumentScanner } from "@/modules/documents/components/document-scanner";
import { FieldScanMark, ScanNotices } from "@/modules/documents/components/scan-notices";
import { applyBillExtraction, type BillScanApplication } from "@/modules/documents/domain/apply";
import type { DocumentExtractionResult } from "@/modules/documents/schemas/extraction";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";

interface BillFormProps {
  mode: "create" | "edit";
  accountId: string;
  billId?: string;
  tracksReadings: boolean;
  /** Household currency — a bill in any other currency is blocked rather
   * than saved, since utility totals are summed currency-blind. */
  householdCurrency: "MKD" | "EUR";
  /** False when no extraction provider is configured. */
  scanEnabled?: boolean;
  /** Pre-fills previous readings from the account's most recent bill —
   * SRS §11.3 entry ergonomics. Ignored in edit mode. */
  previousReadingDefaults?: { high: number; low: number } | null;
  defaultValues?: {
    periodFrom: string; // "YYYY-MM-DD"
    periodTo: string;
    issueDate: string | null;
    dueDate: string;
    amount: number;
    paymentDate: string | null;
    invoiceNumber: string | null;
    notes: string | null;
    readingHigh: { previousReading: number; currentReading: number; meterRollover: boolean } | null;
    readingLow: { previousReading: number; currentReading: number; meterRollover: boolean } | null;
  };
}

function FieldError({ message }: { message: string | undefined }) {
  const tv = useTranslations();
  if (!message) return null;
  return <p className="text-sm text-destructive">{translateDynamic(tv, message)}</p>;
}

function numText(value: number | undefined | null): string {
  return value === undefined || value === null ? "" : String(value);
}

export function BillForm({
  mode,
  accountId,
  billId,
  tracksReadings,
  householdCurrency,
  scanEnabled = false,
  previousReadingDefaults,
  defaultValues,
}: BillFormProps) {
  const t = useTranslations("utilities.bill");
  const tc = useTranslations("common");
  const td = useTranslations("documents.scan");
  const tv = useTranslations();
  const router = useRouter();

  const action = mode === "edit" ? updateUtilityBill.bind(null, billId!) : createUtilityBill;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const [periodFrom, setPeriodFrom] = React.useState(defaultValues?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = React.useState(defaultValues?.periodTo ?? "");
  const [issueDate, setIssueDate] = React.useState(defaultValues?.issueDate ?? "");
  const [dueDate, setDueDate] = React.useState(defaultValues?.dueDate ?? "");
  const [amount, setAmount] = React.useState(numText(defaultValues?.amount));
  const [invoiceNumber, setInvoiceNumber] = React.useState(defaultValues?.invoiceNumber ?? "");

  const [previousReadingHigh, setPreviousReadingHigh] = React.useState(
    numText(defaultValues?.readingHigh?.previousReading ?? previousReadingDefaults?.high)
  );
  const [currentReadingHigh, setCurrentReadingHigh] = React.useState(
    numText(defaultValues?.readingHigh?.currentReading)
  );
  const [previousReadingLow, setPreviousReadingLow] = React.useState(
    numText(defaultValues?.readingLow?.previousReading ?? previousReadingDefaults?.low)
  );
  const [currentReadingLow, setCurrentReadingLow] = React.useState(
    numText(defaultValues?.readingLow?.currentReading)
  );

  const [scan, setScan] = React.useState<
    (BillScanApplication & { provider: string; mismatch: boolean }) | null
  >(null);

  const showScanner = scanEnabled && mode === "create";

  function handleExtracted(result: DocumentExtractionResult) {
    if (result.extraction.documentType !== "ELECTRICITY_BILL") {
      setScan({
        ...applyBillExtraction({ documentType: "ELECTRICITY_BILL" }, householdCurrency, tracksReadings),
        provider: result.provider,
        mismatch: true,
      });
      return;
    }

    const applied = applyBillExtraction(result.extraction, householdCurrency, tracksReadings);
    setScan({ ...applied, provider: result.provider, mismatch: result.mismatch });

    const v = applied.values;
    if (v.periodFrom) setPeriodFrom(v.periodFrom);
    if (v.periodTo) setPeriodTo(v.periodTo);
    if (v.issueDate) setIssueDate(v.issueDate);
    if (v.dueDate) setDueDate(v.dueDate);
    if (v.amount !== undefined) setAmount(v.amount);
    if (v.invoiceNumber) setInvoiceNumber(v.invoiceNumber);
    // The previous readings are pre-filled from the last bill, which is the
    // more reliable source — the document only overwrites them if it
    // actually printed a previous reading of its own.
    if (v.previousReadingHigh !== undefined) setPreviousReadingHigh(v.previousReadingHigh);
    if (v.currentReadingHigh !== undefined) setCurrentReadingHigh(v.currentReadingHigh);
    if (v.previousReadingLow !== undefined) setPreviousReadingLow(v.previousReadingLow);
    if (v.currentReadingLow !== undefined) setCurrentReadingLow(v.currentReadingLow);
  }

  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/utilities/${accountId}`);
    }
  }, [state, router, accountId]);

  const submitDisabled = isPending || (scan?.currencyMismatch ?? false);

  return (
    <div className="flex flex-col gap-4">
      {showScanner && (
        <DocumentScanner
          documentType="ELECTRICITY_BILL"
          onExtracted={handleExtracted}
          disabled={isPending}
        />
      )}

      {scan && (
        <>
          <ScanNotices
            provider={scan.provider}
            mismatch={scan.mismatch}
            foreignCurrency={scan.currencyMismatch ? scan.currency : null}
            householdCurrency={householdCurrency}
            lowConfidenceFields={scan.lowConfidenceFields}
          />
          {scan.missingReadings && (
            // Said before the user reviews the rest, rather than as four
            // field errors after they press save.
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {td("readingsNeeded")}
            </p>
          )}
        </>
      )}

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="inputMethod" value={scan ? "OCR" : "MANUAL"} />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="periodFrom">{t("periodFrom")}</Label>
              <FieldScanMark confidence={scan?.confidence.periodFrom} />
            </div>
            <Input
              id="periodFrom"
              name="periodFrom"
              type="date"
              required
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
            <FieldError message={fieldErrors?.periodFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="periodTo">{t("periodTo")}</Label>
              <FieldScanMark confidence={scan?.confidence.periodTo} />
            </div>
            <Input
              id="periodTo"
              name="periodTo"
              type="date"
              required
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
            <FieldError message={fieldErrors?.periodTo} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="issueDate">{t("issueDate")}</Label>
              <FieldScanMark confidence={scan?.confidence.issueDate} />
            </div>
            <Input
              id="issueDate"
              name="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="dueDate">{t("dueDate")}</Label>
              <FieldScanMark confidence={scan?.confidence.dueDate} />
            </div>
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <FieldError message={fieldErrors?.dueDate} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="amount">{t("amount")}</Label>
              <FieldScanMark confidence={scan?.confidence.amount} />
            </div>
            <Input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <FieldError message={fieldErrors?.amount} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentDate">{t("paymentDate")}</Label>
            <Input
              id="paymentDate"
              name="paymentDate"
              type="date"
              defaultValue={defaultValues?.paymentDate ?? ""}
            />
          </div>
        </div>

        {tracksReadings && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">{t("readingsTitle")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-muted-foreground">{t("highBand")}</legend>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="previousReadingHigh">{t("previousReading")}</Label>
                    <FieldScanMark confidence={scan?.confidence.previousReadingHigh} />
                  </div>
                  <Input
                    id="previousReadingHigh"
                    name="previousReadingHigh"
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0}
                    required
                    value={previousReadingHigh}
                    onChange={(e) => setPreviousReadingHigh(e.target.value)}
                  />
                  <FieldError message={fieldErrors?.previousReadingHigh} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="currentReadingHigh">{t("currentReading")}</Label>
                    <FieldScanMark confidence={scan?.confidence.currentReadingHigh} />
                  </div>
                  <Input
                    id="currentReadingHigh"
                    name="currentReadingHigh"
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0}
                    required
                    value={currentReadingHigh}
                    onChange={(e) => setCurrentReadingHigh(e.target.value)}
                  />
                  <FieldError message={fieldErrors?.currentReadingHigh} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="rolloverHigh" defaultChecked={defaultValues?.readingHigh?.meterRollover ?? false} />
                  {t("rollover")}
                </label>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-muted-foreground">{t("lowBand")}</legend>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="previousReadingLow">{t("previousReading")}</Label>
                    <FieldScanMark confidence={scan?.confidence.previousReadingLow} />
                  </div>
                  <Input
                    id="previousReadingLow"
                    name="previousReadingLow"
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0}
                    required
                    value={previousReadingLow}
                    onChange={(e) => setPreviousReadingLow(e.target.value)}
                  />
                  <FieldError message={fieldErrors?.previousReadingLow} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="currentReadingLow">{t("currentReading")}</Label>
                    <FieldScanMark confidence={scan?.confidence.currentReadingLow} />
                  </div>
                  <Input
                    id="currentReadingLow"
                    name="currentReadingLow"
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min={0}
                    required
                    value={currentReadingLow}
                    onChange={(e) => setCurrentReadingLow(e.target.value)}
                  />
                  <FieldError message={fieldErrors?.currentReadingLow} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="rolloverLow" defaultChecked={defaultValues?.readingLow?.meterRollover ?? false} />
                  {t("rollover")}
                </label>
              </fieldset>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="invoiceNumber">{t("invoiceNumber")}</Label>
              <FieldScanMark confidence={scan?.confidence.invoiceNumber} />
            </div>
            <Input
              id="invoiceNumber"
              name="invoiceNumber"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
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
