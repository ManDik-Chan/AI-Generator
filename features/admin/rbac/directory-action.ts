"use server";

import { getAdminOverview } from "@/features/admin/data";
import { toPlatformDirectory } from "@/features/admin/rbac/server-directory";

/*
 * Fresh /admin role directory for the signed-in viewer, returned as an action result.
 *
 * The page renders the same data, but after a role change the directory must not depend on the
 * whole /admin tree re-rendering: CI showed React (19.1.10) intermittently leaving that transition
 * suspended with no pending wake-up, even though Next.js had received the fresh tree, which left a
 * row on 「正在同步最新权限…」. Action results always reach the component, so the directory loads
 * its snapshot this way after a confirmed change and on 「刷新最新状态」.
 *
 * Same boundary as the page: getAdminOverview() runs requireAdmin() (signed-out and USER sessions are
 * redirected) and the result is parsed to the view model, so nothing outside it is returned.
 */
export async function loadPlatformDirectoryAction() {
  const directory = toPlatformDirectory(await getAdminOverview());
  if (!directory.ok) {
    console.error("[admin] platform directory failed contract validation", directory.issues);
    return { ok: false } as const;
  }
  return { ok: true, directory: directory.value } as const;
}
