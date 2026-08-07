"use client";

import * as React from "react";
import { flexRender, type SortingState, type ColumnDef } from "@tanstack/react-table";
// See fuel/components/fuel-entries-table.tsx for why this uses the v9
// `/legacy` compat import instead of the removed v8 `useReactTable`.
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
import { deleteUtilityBill, toggleBillPaid } from "@/modules/utilities/server/bill-actions";
import { derivePaymentStatus } from "@/modules/utilities/domain/payment-status";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

export interface UtilityBillRow {
  id: string;
  accountId: string;
  periodFrom: string; // ISO
  periodTo: string;
  dueDate: string;
  paymentDate: string | null;
  amount: number;
  currency: SupportedCurrency;
  invoiceNumber: string | null;
  notes: string | null;
  kwh: number;
}

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  OVERDUE: "bg-destructive/15 text-destructive",
  UNPAID: "bg-muted text-muted-foreground",
};

function StatusBadge({ row }: { row: UtilityBillRow }) {
  const t = useTranslations("utilities.status");
  const status = derivePaymentStatus({
    paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
    dueDate: new Date(row.dueDate),
  });
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}>
      {t(status)}
    </span>
  );
}

const columnHelper = createColumnHelper<UtilityBillRow>();

export function BillsTable({ bills }: { bills: UtilityBillRow[] }) {
  const t = useTranslations("utilities.bill");
  const tv = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [sorting, setSorting] = React.useState<SortingState>([{ id: "periodFrom", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const filteredData = React.useMemo(() => {
    if (!globalFilter) return bills;
    const needle = globalFilter.toLowerCase();
    return bills.filter((b) =>
      `${b.invoiceNumber ?? ""} ${b.notes ?? ""}`.toLowerCase().includes(needle)
    );
  }, [bills, globalFilter]);

  async function handleDelete(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    const result = await deleteUtilityBill(id);
    if (!result.ok) {
      setActionError(result.error ?? null);
      return;
    }
    setActionError(null);
    router.refresh();
  }

  async function handleTogglePaid(id: string, markPaid: boolean) {
    const result = await toggleBillPaid(id, markPaid);
    if (!result.ok) {
      setActionError(result.error ?? null);
      return;
    }
    setActionError(null);
    router.refresh();
  }

  // Each column's TValue differs; TanStack's ColumnDef array type can't
  // express that heterogeneity covariantly — see fuel-entries-table.tsx.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = React.useMemo<ColumnDef<LegacyFeatures, UtilityBillRow, any>[]>(
    () => [
      columnHelper.accessor("periodFrom", {
        header: t("periodFrom"),
        cell: (info) => `${formatDate(info.getValue(), locale)} – ${formatDate(info.row.original.periodTo, locale)}`,
      }),
      columnHelper.accessor("dueDate", {
        header: t("dueDate"),
        cell: (info) => formatDate(info.getValue(), locale),
      }),
      columnHelper.accessor("amount", {
        header: t("amount"),
        cell: (info) => formatMoney(info.getValue(), info.row.original.currency, locale),
      }),
      columnHelper.accessor("kwh", {
        header: "kWh",
        cell: (info) => (info.getValue() > 0 ? formatNumber(info.getValue(), locale, { maximumFractionDigits: 1 }) : "—"),
      }),
      columnHelper.display({
        id: "status",
        header: "",
        cell: (info) => <StatusBadge row={info.row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => {
          const row = info.row.original;
          const isPaid = row.paymentDate !== null;
          return (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="text-xs underline-offset-4 hover:underline"
                onClick={() => handleTogglePaid(row.id, !isPaid)}
              >
                {isPaid ? t("markUnpaid") : t("markPaid")}
              </button>
              <Link
                href={`/utilities/${row.accountId}/bills/${row.id}/edit`}
                className="text-xs underline-offset-4 hover:underline"
              >
                {t("editButton")}
              </Link>
              <button
                type="button"
                className="text-xs text-destructive underline-offset-4 hover:underline"
                onClick={() => handleDelete(row.id)}
              >
                {t("deleteButton")}
              </button>
            </div>
          );
        },
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
      <Input
        placeholder={t("filterPlaceholder")}
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />

      {actionError && (
        <p className="text-sm text-destructive">{translateDynamic(tv, actionError)}</p>
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
          const b = row.original;
          const isPaid = b.paymentDate !== null;
          return (
            <div key={b.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {formatDate(b.periodFrom, locale)} – {formatDate(b.periodTo, locale)}
                </span>
                <span>{formatMoney(b.amount, b.currency, locale)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t("dueDate")}: {formatDate(b.dueDate, locale)}
                </span>
                <StatusBadge row={b} />
              </div>
              <div className="mt-1 flex justify-end gap-4">
                <button
                  type="button"
                  className="text-xs underline-offset-4 hover:underline"
                  onClick={() => handleTogglePaid(b.id, !isPaid)}
                >
                  {isPaid ? t("markUnpaid") : t("markPaid")}
                </button>
                <Link
                  href={`/utilities/${b.accountId}/bills/${b.id}/edit`}
                  className="text-xs underline-offset-4 hover:underline"
                >
                  {t("editButton")}
                </Link>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-4 hover:underline"
                  onClick={() => handleDelete(b.id)}
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
