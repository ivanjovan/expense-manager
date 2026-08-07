"use client";

import * as React from "react";
import { flexRender, type SortingState, type ColumnDef } from "@tanstack/react-table";
// TanStack Table v9 replaced the v8 `useReactTable` API with a new
// `useTable` hook architecture; `/legacy` is the (deprecated but
// supported) v8-compatible shim, used here to keep this file's shape
// close to the mainstream docs/examples. A migration to `useTable` is a
// reasonable later cleanup, not a Phase 1 blocker.
import {
  useLegacyTable as useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  legacyCreateColumnHelper as createColumnHelper,
  type LegacyFeatures,
} from "@tanstack/react-table/legacy";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatMoney, formatNumber, type SupportedCurrency } from "@/shared/lib/money";
import { deleteFuelEntry } from "@/modules/fuel/server/fuel-entry-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Button } from "@/shared/components/ui/button";

export interface FuelEntryRow {
  id: string;
  vehicleId: string;
  date: string; // ISO
  odometer: number;
  fuelPrice: number;
  liters: number;
  totalPaid: number;
  currency: SupportedCurrency;
  isFullTank: boolean;
  missedEntries: boolean;
  station: string | null;
  notes: string | null;
  createdByName: string;
}

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

const columnHelper = createColumnHelper<FuelEntryRow>();

export function FuelEntriesTable({ entries }: { entries: FuelEntryRow[] }) {
  const t = useTranslations("fuel.entry");
  const tv = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [sorting, setSorting] = React.useState<SortingState>([{ id: "date", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [fullTankOnly, setFullTankOnly] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const filteredData = React.useMemo(() => {
    return entries.filter((e) => {
      if (fullTankOnly && !e.isFullTank) return false;
      if (!globalFilter) return true;
      const haystack = `${e.station ?? ""} ${e.notes ?? ""}`.toLowerCase();
      return haystack.includes(globalFilter.toLowerCase());
    });
  }, [entries, fullTankOnly, globalFilter]);

  async function handleDelete(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    const result = await deleteFuelEntry(id);
    if (!result.ok) {
      setDeleteError(result.error ?? null);
      return;
    }
    setDeleteError(null);
    router.refresh();
  }

  // Each column's TValue differs (string, number, boolean...); TanStack's
  // ColumnDef array type can't express that heterogeneity covariantly, so
  // `any` here is the library's own escape hatch, not a gap in this code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = React.useMemo<ColumnDef<LegacyFeatures, FuelEntryRow, any>[]>(
    () => [
      columnHelper.accessor("date", {
        header: t("date"),
        cell: (info) => formatDate(info.getValue(), locale),
      }),
      columnHelper.accessor("odometer", {
        header: t("odometer"),
        cell: (info) => formatNumber(info.getValue(), locale),
      }),
      columnHelper.accessor("fuelPrice", {
        header: t("fuelPrice"),
        cell: (info) => formatMoney(info.getValue(), info.row.original.currency, locale),
      }),
      columnHelper.accessor("liters", {
        header: t("liters"),
        cell: (info) => formatNumber(info.getValue(), locale, { maximumFractionDigits: 2 }),
      }),
      columnHelper.accessor("totalPaid", {
        header: t("totalPaid"),
        cell: (info) => formatMoney(info.getValue(), info.row.original.currency, locale),
      }),
      columnHelper.accessor("isFullTank", {
        header: t("isFullTank"),
        cell: (info) => (
          <span aria-label={info.getValue() ? t("isFullTank") : undefined}>
            {info.getValue() ? "●" : "○"}
          </span>
        ),
      }),
      columnHelper.accessor("station", {
        header: t("station"),
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex justify-end gap-3">
            <Link
              href={`/vehicles/${info.row.original.vehicleId}/fuel/${info.row.original.id}/edit`}
              className="text-xs underline-offset-4 hover:underline"
            >
              {t("editButton")}
            </Link>
            <button
              type="button"
              className="text-xs text-destructive underline-offset-4 hover:underline"
              onClick={() => handleDelete(info.row.original.id)}
            >
              {t("deleteButton")}
            </button>
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, locale]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Input
          placeholder={t("filterPlaceholder")}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={fullTankOnly}
            onChange={(e) => setFullTankOnly(e.target.checked)}
          />
          {t("isFullTank")}
        </label>
      </div>

      {deleteError && (
        <p className="text-sm text-destructive">{translateDynamic(tv, deleteError)}</p>
      )}

      {/* Desktop table — SRS §13 requires no horizontal scroll on mobile,
          so below `md` this becomes the card list instead. */}
      <div className="hidden md:block overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-3 py-2 text-left font-medium"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {table.getRowModel().rows.map((row) => {
          const e = row.original;
          return (
            <div key={e.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatDate(e.date, locale)}</span>
                <span>{formatMoney(e.totalPaid, e.currency, locale)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatNumber(e.odometer, locale)} km ·{" "}
                {formatNumber(e.liters, locale, { maximumFractionDigits: 2 })} L @{" "}
                {formatMoney(e.fuelPrice, e.currency, locale)}
                {!e.isFullTank ? ` · ${t("isFullTank")}: ○` : ""}
              </div>
              {e.station && <div className="text-xs text-muted-foreground">{e.station}</div>}
              <div className="mt-1 flex justify-end gap-4">
                <Link
                  href={`/vehicles/${e.vehicleId}/fuel/${e.id}/edit`}
                  className="text-xs underline-offset-4 hover:underline"
                >
                  {t("editButton")}
                </Link>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-4 hover:underline"
                  onClick={() => handleDelete(e.id)}
                >
                  {t("deleteButton")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filteredData.length}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            ‹
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  );
}
