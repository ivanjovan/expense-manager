"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney, formatNumber, type SupportedCurrency } from "@/shared/lib/money";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";

export interface MonthlyExpensePoint {
  month: string; // "YYYY-MM"
  amount: number;
}
export interface YearlyExpensePoint {
  year: number;
  amount: number;
}
export interface MonthlyKwhPoint {
  month: string;
  kwh: number;
}
export interface CategoryAmountPoint {
  category: string;
  label: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  locale,
  isYear,
}: TooltipContentProps & {
  formatValue: (value: number) => string;
  locale: string;
  isYear?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rawValue = payload[0]?.value;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== "number") return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-muted-foreground">
        {isYear ? String(label) : formatMonthLabel(String(label), locale)}
      </p>
      <p className="font-semibold text-card-foreground">{formatValue(value)}</p>
    </div>
  );
}

function formatMonthLabel(value: string, locale: string): string {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID_STROKE = "var(--border)";
const SERIES_COLOR = "var(--primary)";

export function MonthlyExpensesChart({
  points,
  currency,
}: {
  points: MonthlyExpensePoint[];
  currency: SupportedCurrency;
}) {
  const t = useTranslations("utilities.charts");
  const locale = useLocale();
  if (points.length === 0) return <EmptyChart label={t("monthlyExpenses")} />;

  return (
    <ChartCard title={t("monthlyExpenses")}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatMonthLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip {...props} locale={locale} formatValue={(v) => formatMoney(v, currency, locale)} />
          )}
        />
        <Bar dataKey="amount" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartCard>
  );
}

export function YearlyExpensesChart({
  points,
  currency,
}: {
  points: YearlyExpensePoint[];
  currency: SupportedCurrency;
}) {
  const t = useTranslations("utilities.charts");
  const locale = useLocale();
  if (points.length === 0) return <EmptyChart label={t("yearlyExpenses")} />;

  return (
    <ChartCard title={t("yearlyExpenses")}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => formatMoney(v, currency, locale)}
              isYear
            />
          )}
        />
        <Bar dataKey="amount" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartCard>
  );
}

export function KwhConsumptionChart({ points }: { points: MonthlyKwhPoint[] }) {
  const t = useTranslations("utilities.charts");
  const locale = useLocale();
  if (points.length === 0) return <EmptyChart label={t("kwhConsumption")} />;

  return (
    <ChartCard title={t("kwhConsumption")}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatMonthLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => `${formatNumber(v, locale, { maximumFractionDigits: 1 })} kWh`}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="kwh"
          stroke={SERIES_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
        />
      </LineChart>
    </ChartCard>
  );
}

/** Shared shape for the two simple 2-category comparisons (paid vs.
 * unpaid, high vs. low tariff) — one bar chart, categorical x-axis. */
function CategoryBarChart({
  title,
  points,
  formatValue,
}: {
  title: string;
  points: CategoryAmountPoint[];
  formatValue: (value: number) => string;
}) {
  const locale = useLocale();
  if (points.every((p) => p.value === 0)) return <EmptyChart label={title} />;

  return (
    <ChartCard title={title}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => <ChartTooltip {...props} locale={locale} formatValue={formatValue} isYear />}
        />
        <Bar dataKey="value" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ChartCard>
  );
}

export function PaidVsUnpaidChart({
  paid,
  unpaid,
  currency,
}: {
  paid: number;
  unpaid: number;
  currency: SupportedCurrency;
}) {
  const t = useTranslations("utilities.charts");
  const ts = useTranslations("utilities.status");
  const locale = useLocale();
  return (
    <CategoryBarChart
      title={t("paidVsUnpaid")}
      points={[
        { category: "PAID", label: ts("PAID"), value: paid },
        { category: "UNPAID", label: ts("UNPAID"), value: unpaid },
      ]}
      formatValue={(v) => formatMoney(v, currency, locale)}
    />
  );
}

export function HighLowSplitChart({ high, low }: { high: number; low: number }) {
  const t = useTranslations("utilities.charts");
  const tb = useTranslations("utilities.bill");
  const locale = useLocale();
  return (
    <CategoryBarChart
      title={t("highLowSplit")}
      points={[
        { category: "HIGH", label: tb("highBand"), value: high },
        { category: "LOW", label: tb("lowBand"), value: low },
      ]}
      formatValue={(v) => `${formatNumber(v, locale, { maximumFractionDigits: 1 })} kWh`}
    />
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  const t = useTranslations("utilities.bill");
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex h-64 items-center justify-center pt-0 text-center text-sm text-muted-foreground">
        {t("emptyTitle")}
      </CardContent>
    </Card>
  );
}
