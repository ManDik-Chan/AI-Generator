"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react";

import { MemberDirectoryView, type RoleFilter } from "@/features/admin/components/member-directory-view";
import { RoleChangeDialogView } from "@/features/admin/components/role-change-dialog-view";
import { interpretDirectoryLoad, isFrameworkNavigation, performRoleChange, type DirectoryLoader, type PlatformMember, type PlatformViewer, type RoleChangeSubmitter } from "@/features/admin/rbac/contract";
import { buildRoleChangeRequest, canSubmit, directoryReducer, initialDirectoryState } from "@/features/admin/rbac/role-change-state";

export interface PlatformMemberDirectoryProps {
  viewer: PlatformViewer;
  members: PlatformMember[];
  totalMembers: number;
  /** When the server built `members` (the directory snapshot's generatedAt). */
  generatedAt: string;
  /** The role-change server action. Without it the directory is read-only. */
  onChangeRole?: RoleChangeSubmitter;
  /** Loads a fresh snapshot as an action result; used after a confirmed change and on refresh. */
  onLoadDirectory?: DirectoryLoader;
  loginHref?: string;
}

interface Snapshot {
  generatedAt: string;
  members: PlatformMember[];
  totalMembers: number;
}

export function PlatformMemberDirectory({ viewer, members, totalMembers, generatedAt, onChangeRole, onLoadDirectory, loginHref = "/login?next=%2Fadmin" }: PlatformMemberDirectoryProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(directoryReducer, members, initialDirectoryState);
  const [snapshot, setSnapshot] = useState<Snapshot>({ generatedAt, members, totalMembers });
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  // A redirect or not-found from the loader, rethrown during render so Next.js's boundaries navigate.
  const [navigation, setNavigation] = useState<{ error: unknown } | null>(null);
  const [, startTransition] = useTransition();

  const inFlight = useRef(false);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const lastMemberId = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recoveryRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Server snapshots arrive from page renders (props) and from the loader action. Keep the newest:
  // a page render that commits late must not replace data the loader already brought.
  const newest = useRef(generatedAt);
  const accept = useCallback((next: Snapshot) => {
    if (Date.parse(next.generatedAt) <= Date.parse(newest.current)) return;
    newest.current = next.generatedAt;
    setSnapshot(next);
    dispatch({ type: "serverData", members: next.members });
  }, []);

  const seenMembers = useRef(members);
  useEffect(() => {
    if (seenMembers.current === members) return;
    seenMembers.current = members;
    accept({ generatedAt, members, totalMembers });
  }, [accept, generatedAt, members, totalMembers]);

  /*
   * Fresh data for the directory comes back as an action result rather than only through the page
   * re-rendering: CI showed the revalidated or refreshed /admin tree being received but, at times,
   * never committed by React, which left a row waiting on 「正在同步最新权限…」. router.refresh() still
   * runs so the rest of the page updates as well.
   */
  const loadDirectory = useCallback(() => {
    if (!onLoadDirectory) return;
    void onLoadDirectory().then(
      (raw) => {
        const directory = interpretDirectoryLoad(raw);
        if (directory) accept({ generatedAt: directory.generatedAt, members: directory.members, totalMembers: directory.totalMembers });
      },
      (error: unknown) => {
        // A failed load keeps what is shown; the page refresh may still deliver.
        if (isFrameworkNavigation(error)) setNavigation({ error });
      },
    );
  }, [accept, onLoadDirectory]);

  const changesEnabled = Boolean(onChangeRole) && viewer.platformRole !== "USER" && viewer.capabilities.manageRoles;
  const session = state.session;
  const activeMember = session ? snapshot.members.find((member) => member.id === session.memberId) ?? null : null;

  const refresh = useCallback(() => {
    router.refresh();
    loadDirectory();
  }, [loadDirectory, router]);

  const submit = () => {
    if (!onChangeRole || inFlight.current || !session || !canSubmit(session)) return;
    // Same rule as the reducer: a retry of the same intent reuses its key; a new intent gets one.
    const requestId = session.requestId ?? crypto.randomUUID();
    const request = buildRoleChangeRequest({ ...session, requestId });
    if (!request) return;
    inFlight.current = true;
    dispatch({ type: "submit", requestId });
    startTransition(async () => {
      try {
        const outcome = await performRoleChange(onChangeRole, request);
        dispatch({ type: "resolved", outcome });
        // A confirmed change unlocks its row once a snapshot shows the new version. After a failure
        // the row stays locked until the viewer asks for the latest state.
        if (outcome.ok) loadDirectory();
      } finally {
        inFlight.current = false;
      }
    });
  };

  // Focus: into the choices when the dialog opens, back to the row's trigger when it closes.
  const isOpen = Boolean(changesEnabled && session && activeMember);
  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => {
        const body = bodyRef.current;
        const target = body?.querySelector<HTMLInputElement>("input[type=radio]:checked") ?? body?.querySelector<HTMLInputElement>("input[type=radio]");
        target?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    const id = lastMemberId.current;
    if (id) triggers.current.get(id)?.focus();
  }, [isOpen]);

  // After a failure, focus the way forward: the recovery action, or the confirm button for a retry.
  const failure = session?.failure ?? null;
  useEffect(() => {
    if (!failure) return;
    const frame = requestAnimationFrame(() => (failure.retryable ? confirmRef.current : recoveryRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [failure]);

  if (navigation) throw navigation.error;

  return (
    <>
      <MemberDirectoryView
        changesEnabled={changesEnabled}
        loginHref={loginHref}
        members={snapshot.members}
        onOpen={(member) => { lastMemberId.current = member.id; dispatch({ type: "open", member }); }}
        onQueryChange={setQuery}
        onRefresh={refresh}
        onRoleFilterChange={setRoleFilter}
        query={query}
        registerTrigger={(memberId, element) => { if (element) triggers.current.set(memberId, element); else triggers.current.delete(memberId); }}
        roleFilter={roleFilter}
        state={state}
        totalMembers={snapshot.totalMembers}
        viewer={viewer}
      />
      <RoleChangeDialogView
        bodyRef={bodyRef}
        confirmRef={confirmRef}
        loginHref={loginHref}
        member={changesEnabled ? activeMember : null}
        onClose={() => dispatch({ type: "close" })}
        onRefresh={refresh}
        onSelect={(role) => dispatch({ type: "select", role })}
        onSubmit={submit}
        recoveryRef={recoveryRef}
        session={session}
      />
    </>
  );
}
