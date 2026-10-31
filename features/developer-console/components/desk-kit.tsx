"use client";

import { useId, type ReactNode } from "react";
import { Lock } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button, type ButtonProps } from "@/components/ui/button";
import { errorMeta, successText } from "@/features/developer-console/labels";
import { contractMeta, type ContractStatus } from "@/features/developer-console/permissions";
import type { CommandResult, ConsoleCommand, ConsolePersona, ConsoleProjectView, ConsoleRole } from "@/features/developer-console/model";
import { cn } from "@/lib/utils";

export interface Gate {
  allowed: boolean;
  reason?: string;
  /** A member who could do this, offered as a one-click persona switch. */
  suggest?: ConsolePersona;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command as a panel writes it; the desk adds projectId and a fresh Idempotency-Key. */
export type DeskCommand = DistributiveOmit<ConsoleCommand, "idempotencyKey" | "projectId"> & { idempotencyKey?: string };

/** The latest command result; `origin` is the button that sent it (null for replays). */
export interface DeskResult {
  action: ConsoleCommand["action"];
  result: CommandResult;
  origin: string | null;
}

/** Everything the desk panels need, built once by the ReleaseDesk container. */
export interface DeskApi {
  view: ConsoleProjectView;
  personaId: string;
  roles: ConsoleRole[];
  personas: ConsolePersona[];
  now: number;
  pending: ConsoleCommand["action"] | null;
  last: DeskResult | null;
  /** Records which control is about to send, so the result can be shown beside it. */
  markOrigin(origin: string): void;
  gate(action: ConsoleCommand["action"], independence?: { blocked: boolean; reason: string; role: ConsoleRole }): Gate;
  send(command: DeskCommand): Promise<CommandResult>;
  switchPersona(personaId: string): void;
  personaName(personaId: string): string;
}

const contractTone: Record<ContractStatus, "success" | "warning" | "neutral"> = { merged: "success", provisional: "warning", gap: "neutral" };

export function ContractBadge({ status, className }: { status: ContractStatus; className?: string }) {
  return <ToneBadge className={className} tone={contractTone[status]}>{contractMeta[status].label}</ToneBadge>;
}

/**
 * A command button that explains itself when the acting persona may not use it: which
 * role is missing, who could do it instead, and a way to send it anyway to see the
 * protocol's actual rejection.
 */
export function ActionButton({
  api,
  action,
  gate,
  onRun,
  blockedReason,
  children,
  variant = "default",
  className,
  origin,
  hint = true,
}: {
  api: DeskApi;
  action: ConsoleCommand["action"];
  gate: Gate;
  onRun: () => void;
  /** A state reason (e.g. unsaved changes) that disables the button regardless of permissions. */
  blockedReason?: string;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  className?: string;
  /** Shared origin id when several buttons report through one ActionGroup. */
  origin?: string;
  /** False inside an ActionGroup, which shows one explanation and result for all its buttons. */
  hint?: boolean;
}) {
  const ownId = useId();
  const id = origin ?? ownId;
  const busy = api.pending === action;
  const run = () => { api.markOrigin(id); onRun(); };
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-1.5", className)}>
      <Button disabled={!gate.allowed || Boolean(blockedReason) || api.pending !== null} loading={busy} onClick={run} size="sm" variant={variant}>
        {!gate.allowed ? <Lock aria-hidden="true" className="size-3.5" /> : null}
        {children}
      </Button>
      {hint ? (
        <>
          {!gate.allowed ? <GateHint api={api} gate={gate} onRun={onRun} origin={id} /> : blockedReason ? <p className="max-w-[24rem] text-[.6875rem] leading-4 text-muted-foreground">{blockedReason}</p> : null}
          <InlineResult api={api} origin={id} />
        </>
      ) : null}
    </div>
  );
}

/** Why a gated command is unavailable, who could run it, and a way to send it anyway. */
export function GateHint({ api, gate, onRun, origin }: { api: DeskApi; gate: Gate; onRun: () => void; origin: string }) {
  if (gate.allowed) return null;
  return (
    <p className="max-w-[24rem] text-[.6875rem] leading-4 text-muted-foreground">
      {gate.reason}
      {gate.suggest ? (
        <> · <button className="link-grow font-medium text-foreground" onClick={() => api.switchPersona(gate.suggest!.id)} type="button">切换为{gate.suggest.name}</button></>
      ) : null}
      {" · "}
      <button className="link-grow" disabled={api.pending !== null} onClick={() => { api.markOrigin(origin); onRun(); }} type="button">仍然发送，查看拒绝响应</button>
    </p>
  );
}

/**
 * One line under the control that sent the latest command, so the outcome is visible where the
 * click happened. The full explanation stays in the desk's live result banner.
 */
export function InlineResult({ api, origin }: { api: DeskApi; origin: string }) {
  const last = api.last;
  if (!last || last.origin !== origin) return null;
  if (last.result.ok) {
    return <p className="max-w-[24rem] text-[.6875rem] leading-4 text-success-foreground">{last.result.response.replayed ? "重放：返回了原来的结果" : successText[last.action]}</p>;
  }
  const { status, code } = last.result.error;
  return <p className="max-w-[24rem] text-[.6875rem] leading-4 text-destructive-foreground"><span className="font-code">{status} {code}</span> · {errorMeta[code].title}</p>;
}

/** Buttons that share one permission gate (e.g. approve / reject) with a single explanation and result line. */
export function ActionGroup({ api, gate, onRunAnyway, origin, children }: { api: DeskApi; gate: Gate; onRunAnyway: () => void; origin: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <GateHint api={api} gate={gate} onRun={onRunAnyway} origin={origin} />
      <InlineResult api={api} origin={origin} />
    </div>
  );
}

export function Panel({ id, title, meta, children, className }: { id: string; title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("scroll-mt-28 rounded-card bg-surface p-5 min-[640px]:p-6", className)} id={id}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.0625rem] font-medium tracking-[-.015em]" id={`${id}-title`}>{title}</h2>
        {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("break-all font-code text-[.75rem]", className)}>{children}</span>;
}

export function Facts({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-1.5 text-[.75rem] min-[521px]:grid-cols-[auto_minmax(0,1fr)]", className)}>
      {items.map(([label, value], index) => (
        <div className="contents" key={index}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
