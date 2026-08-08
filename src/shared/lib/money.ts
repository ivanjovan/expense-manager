/**
 * Money formatting — see SRS §8.1.
 *
 * Plain `Intl.NumberFormat` cannot produce the MKD symbol "ден" in either
 * supported locale (`en` → "MKD 12,345.50", `sr-Latn` → "12.345,50 MKD").
 * Only the (unsupported) `mk` locale carries it. So we let `Intl` format
 * everything — grouping, decimal separator, symbol placement — and then
 * substitute just the currency part from this registry.
 *
 * Adding a currency means adding one entry here. Don't call
 * `Intl.NumberFormat(...).format()` on a monetary value anywhere else in
 * the app — always go through `formatMoney`.
 */

export type SupportedCurrency = "MKD" | "EUR";

/** Exported so the Excel export renders the same symbol the screen does —
 * see numberFormatFor in export/domain/workbook-model.ts. */
export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  MKD: "ден",
  EUR: "€",
};

/** Prisma returns Decimal for money columns; accept that, string, or number. */
type Moneyish = { toString(): string } | number | string;

export function formatMoney(
  amount: Moneyish,
  currency: SupportedCurrency,
  locale: string
): string {
  const value =
    typeof amount === "number" ? amount : Number(amount.toString());

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code", // predictable part to find & replace below
  });

  const parts = formatter.formatToParts(value);

  return parts
    .map((part) =>
      part.type === "currency" ? CURRENCY_SYMBOLS[currency] : part.value
    )
    .join("");
}

/** Locale-aware number formatting without a currency symbol (e.g. litres, kWh). */
export function formatNumber(
  value: Moneyish,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  const num = typeof value === "number" ? value : Number(value.toString());
  return new Intl.NumberFormat(locale, options).format(num);
}
