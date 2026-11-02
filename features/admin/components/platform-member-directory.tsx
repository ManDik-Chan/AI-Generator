"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from "react";

import { MemberDirectoryView, type RoleFilter } from "@/features/admin/components/member-directory-view";
import { RoleChangeDialogView } from "@/features/admin/components/role-change-dialog-view";
import { performRoleChange, type PlatformMember, type PlatformViewer, type RoleChangeSubmitter } from "@/features/admin/rbac/contract";
import { buildRoleChangeRequest, canSubmit, directoryReducer, initialDirectoryState } from "@/features/admin/rbac/role-change-state";

export interface PlatformMemberDirectoryProps {
  viewer: PlatformViewer;
  members: PlatformMember[];
  totalMembers: number;
  /** The role-change server action. Without it the directory is read-only. */
  onChangeRole?: RoleChangeSubmitter;
  loginHref?: string;
}

export function PlatformMemberDirectory({ viewer, members, totalMembers, onChangeRole, loginHref = "/login?next=%2Fadmin" }: PlatformMemberDirectoryProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(directoryReducer, members, initialDirectoryState);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [, startTransition] = useTransition();

  const inFlight = useRef(false);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const lastMemberId = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recoveryRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // A new `members` array means a new server render (router refresh or revalidation).
  const seenMembers = useRef(members);
  useEffect(() => {
    if (seenMembers.current === members) return;
    seenMembers.current = members;
    dispatch({ type: "serverData", members });
  }, [members]);

  const changesEnabled = Boolean(onChangeRole) && viewer.platformRole !== "USER" && viewer.capabilities.manageRoles;
  const session = state.session;
  const activeMember = session ? members.find((member) => member.id === session.memberId) ?? null : null;

  const refresh = useCallback(() => router.refresh(), [router]);

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
        dispatch({ type: "resolved", outcome: await performRoleChange(onChangeRole, request) });
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

  return (
    <>
      <MemberDirectoryView
        changesEnabled={changesEnabled}
        loginHref={loginHref}
        members={members}
        onOpen={(member) => { lastMemberId.current = member.id; dispatch({ type: "open", member }); }}
        onQueryChange={setQuery}
        onRefresh={refresh}
        onRoleFilterChange={setRoleFilter}
        query={query}
        registerTrigger={(memberId, element) => { if (element) triggers.current.set(memberId, element); else triggers.current.delete(memberId); }}
        roleFilter={roleFilter}
        state={state}
        totalMembers={totalMembers}
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
