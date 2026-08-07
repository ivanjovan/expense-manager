"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { inviteMemberFromForm } from "@/modules/household/server/settings-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select } from "@/shared/components/ui/select";

/** Owns its own "copied" state, keyed by token in the parent so a new
 * invite naturally resets it — no effect needed to clear it manually. */
function CopyInviteLinkButton({ link }: { link: string }) {
  const t = useTranslations("household.members");
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }}
    >
      {copied ? t("inviteLinkCopied") : t("copyInviteLink")}
    </Button>
  );
}

export function InviteMemberForm() {
  const t = useTranslations("household.members");
  const tv = useTranslations();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    inviteMemberFromForm,
    undefined
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  const inviteLink =
    state && state.ok && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname.split("/").slice(0, 2).join("/")}/invite/${state.data.token}`
      : null;

  React.useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh(); // pick up the new row in "pending invitations"
    }
  }, [state, router]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">{t("inviteEmailLabel")}</Label>
          <Input id="invite-email" name="email" type="email" required className="w-64" />
          {state && !state.ok && state.fieldErrors?.email && (
            <p className="text-sm text-destructive">{translateDynamic(tv, state.fieldErrors.email)}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">{t("inviteRoleLabel")}</Label>
          <Select id="invite-role" name="role" defaultValue="MEMBER" className="w-40">
            <option value="MEMBER">{t("roleMember")}</option>
            <option value="OWNER">{t("roleOwner")}</option>
          </Select>
        </div>
        <Button type="submit" disabled={isPending}>
          {t("inviteSubmit")}
        </Button>
      </form>

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {translateDynamic(tv, state.error)}
        </p>
      )}

      {inviteLink && state?.ok && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">{t("noEmailNotice")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
              {inviteLink}
            </code>
            <CopyInviteLinkButton key={state.data.token} link={inviteLink} />
          </div>
        </div>
      )}
    </div>
  );
}
