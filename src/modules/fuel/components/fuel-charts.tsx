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

export interface PricePoint {
  date: string; // ISO
  fuelPrice: number;
}

export interface MonthlyPointInput {
  month: string; // "YYYY-MM"
  liters: number;
  spending: number;
}

export interface ConsumptionPoint {
  date: string; // ISO — segment end date
  consumptionL100km: number;
}

/** Recharts needs the browser to measure text/layout — kept as one small
 * client island; every number it's fed is pre-computed server-side. */
function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  locale,
}: TooltipContentProps & {
  formatValue: (value: number) => string;
  locale: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rawValue = payload[0]?.value;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== "number") return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="text-xs text-muted-foreground">{formatAxisLabel(label as string, locale)}</p>
      <p className="font-semibold text-card-foreground">{formatValue(value)}</p>
    </div>
  );
}

function formatAxisLabel(value: string, locale: string): string {
  // "YYYY-MM" or full ISO date — both parse fine via Date().
  const isMonth = /^\d{4}-\d{2}$/.test(value);
  const date = new Date(isMonth ? `${value}-01T00:00:00.000Z` : value);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: isMonth ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID_STROKE = "var(--border)";
const SERIES_COLOR = "var(--primary)";

export function FuelPriceHistoryChart({ points, currency }: { points: PricePoint[]; currency: SupportedCurrency }) {
  const t = useTranslations("fuel.charts");
  const locale = useLocale();
  if (points.length < 2) return <EmptyChart label={t("priceHistory")} />;

  return (
    <ChartCard title={t("priceHistory")}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatAxisLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => formatMoney(v, currency, locale)}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="fuelPrice"
          stroke={SERIES_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
        />
      </LineChart>
    </ChartCard>
  );
}

export function MonthlySpendingChart({ points, currency }: { points: MonthlyPointInput[]; currency: SupportedCurrency }) {
  const t = useTranslations("fuel.charts");
  const locale = useLocale();
  if (points.length === 0) return <EmptyChart label={t("monthlySpending")} />;

  return (
    <ChartCard title={t("monthlySpending")}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatAxisLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => formatMoney(v, currency, locale)}
            />
          )}
        />
        <Bar dataKey="spending" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartCard>
  );
}

export function MonthlyLitersChart({ points }: { points: MonthlyPointInput[] }) {
  const t = useTranslations("fuel.charts");
  const locale = useLocale();
  if (points.length === 0) return <EmptyChart label={t("monthlyLiters")} />;

  return (
    <ChartCard title={t("monthlyLiters")}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatAxisLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => `${formatNumber(v, locale, { maximumFractionDigits: 1 })} L`}
            />
          )}
        />
        <Bar dataKey="liters" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartCard>
  );
}

export function ConsumptionTrendChart({ points }: { points: ConsumptionPoint[] }) {
  const t = useTranslations("fuel.charts");
  const locale = useLocale();
  if (points.length < 2) return <EmptyChart label={t("consumptionTrend")} />;

  return (
    <ChartCard title={t("consumptionTrend")}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickFormatter={(v) => formatAxisLabel(v, locale)}
          axisLine={{ stroke: GRID_STROKE }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          content={(props) => (
            <ChartTooltip
              {...props}
              locale={locale}
              formatValue={(v) => `${formatNumber(v, locale, { maximumFractionDigits: 2 })} L/100km`}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="consumptionL100km"
          stroke={SERIES_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
          activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "var(--card)", strokeWidth: 2 }}
        />
      </LineChart>
    </ChartCard>
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
  const t = useTranslations("fuel.stats");
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex h-64 items-center justify-center pt-0 text-center text-sm text-muted-foreground">
        {t("insufficientData")}
      </CardContent>
    </Card>
  );
}
