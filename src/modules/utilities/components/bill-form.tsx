"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createUtilityBill, updateUtilityBill } from "@/modules/utilities/server/bill-actions";
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

export function BillForm({
  mode,
  accountId,
  billId,
  tracksReadings,
  previousReadingDefaults,
  defaultValues,
}: BillFormProps) {
  const t = useTranslations("utilities.bill");
  const tc = useTranslations("common");
  const tv = useTranslations();
  const router = useRouter();

  const action = mode === "edit" ? updateUtilityBill.bind(null, billId!) : createUtilityBill;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/utilities/${accountId}`);
    }
  }, [state, router, accountId]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="accountId" value={accountId} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodFrom">{t("periodFrom")}</Label>
          <Input id="periodFrom" name="periodFrom" type="date" required defaultValue={defaultValues?.periodFrom} />
          <FieldError message={fieldErrors?.periodFrom} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="periodTo">{t("periodTo")}</Label>
          <Input id="periodTo" name="periodTo" type="date" required defaultValue={defaultValues?.periodTo} />
          <FieldError message={fieldErrors?.periodTo} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input id="issueDate" name="issueDate" type="date" defaultValue={defaultValues?.issueDate ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dueDate">{t("dueDate")}</Label>
          <Input id="dueDate" name="dueDate" type="date" required defaultValue={defaultValues?.dueDate} />
          <FieldError message={fieldErrors?.dueDate} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">{t("amount")}</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            defaultValue={defaultValues?.amount}
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
                <Label htmlFor="previousReadingHigh">{t("previousReading")}</Label>
                <Input
                  id="previousReadingHigh"
                  name="previousReadingHigh"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  required
                  defaultValue={
                    defaultValues?.readingHigh?.previousReading ?? previousReadingDefaults?.high
                  }
                />
                <FieldError message={fieldErrors?.previousReadingHigh} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentReadingHigh">{t("currentReading")}</Label>
                <Input
                  id="currentReadingHigh"
                  name="currentReadingHigh"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  required
                  defaultValue={defaultValues?.readingHigh?.currentReading}
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
                <Label htmlFor="previousReadingLow">{t("previousReading")}</Label>
                <Input
                  id="previousReadingLow"
                  name="previousReadingLow"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  required
                  defaultValue={
                    defaultValues?.readingLow?.previousReading ?? previousReadingDefaults?.low
                  }
                />
                <FieldError message={fieldErrors?.previousReadingLow} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentReadingLow">{t("currentReading")}</Label>
                <Input
                  id="currentReadingLow"
                  name="currentReadingLow"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  required
                  defaultValue={defaultValues?.readingLow?.currentReading}
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
          <Label htmlFor="invoiceNumber">{t("invoiceNumber")}</Label>
          <Input id="invoiceNumber" name="invoiceNumber" defaultValue={defaultValues?.invoiceNumber ?? ""} />
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
