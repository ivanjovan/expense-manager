"use server";

import { ActionResult } from "@/shared/types/action-result";
import { inviteMember } from "./actions";

export async function inviteMemberFromForm(
  _prevState: ActionResult<{ token: string; email: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ token: string; email: string }>> {
  const input = Object.fromEntries(formData.entries());
  return inviteMember(input);
}
