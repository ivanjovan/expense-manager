"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { archiveVehicle, unarchiveVehicle, deleteVehicle } from "@/modules/fuel/server/vehicle-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";

export function VehicleListActions({
  vehicleId,
  vehicleName,
  archived,
  hasEntries,
}: {
  vehicleId: string;
  vehicleName: string;
  archived: boolean;
  hasEntries: boolean;
}) {
  const t = useTranslations("fuel.vehicles");
  const tv = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {archived ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => unarchiveVehicle(vehicleId))}
          >
            {t("unarchiveButton")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => archiveVehicle(vehicleId))}
          >
            {t("archiveButton")}
          </Button>
        )}
        {!hasEntries && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(t("confirmDelete", { name: vehicleName }))) {
                run(() => deleteVehicle(vehicleId));
              }
            }}
          >
            {t("deleteButton")}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{translateDynamic(tv, error)}</p>}
    </div>
  );
}
