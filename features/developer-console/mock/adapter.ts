/*
 * MOCK ConsoleAdapter: wraps the pure engine with a simulated network delay, a protocol
 * log, a mock clock and the environment tools. Lives only in the browser tab; reloading
 * resets everything. Nothing is sent anywhere.
 */
import type { ConsoleAdapter, ConsoleSnapshot } from "@/features/developer-console/adapter";
import type { CommandResult, ConsoleCommand, DraftPayload, ProtocolLogEntry } from "@/features/developer-console/model";
import { commandFunction } from "@/features/developer-console/model";
import { execute, expirySignature, iso, projectSummaries, projectView, toggleQualification, type MockState } from "@/features/developer-console/mock/engine";
import { DEFAULT_PERSONA, SEED_EPOCH, createSeedState, personas } from "@/features/developer-console/mock/seed";

const LOG_LIMIT = 60;

export interface MockAdapterOptions {
  /** Simulated round trip in ms. Tests pass 0. */
  latency?: number;
}

export function createMockConsoleAdapter({ latency = 320 }: MockAdapterOptions = {}): ConsoleAdapter {
  let state: MockState = createSeedState();
  let personaId = DEFAULT_PERSONA;
  let log: ProtocolLogEntry[] = [];
  let pending: ConsoleCommand["action"] | null = null;
  let startedAt: number | null = null;
  let skipped = 0;
  let seq = 0;
  let expiry = "";
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();
  const commands = new Map<number, { command: ConsoleCommand; personaId: string }>();

  const now = () => SEED_EPOCH + skipped + (startedAt === null ? 0 : Date.now() - startedAt);

  const build = (): ConsoleSnapshot => {
    const at = now();
    return {
      source: "mock", personaId, personas, qualified: { ...state.qualified }, now: at,
      summaries: projectSummaries(state, personaId, at),
      views: Object.fromEntries(state.projects.map((project) => [project.slug, projectView(state, project.id, personaId, at)!])),
      log, pending,
    };
  };

  const serverSnapshot = build();
  let snapshot = serverSnapshot;
  const emit = () => {
    snapshot = build();
    expiry = expirySignature(state, snapshot.now);
    listeners.forEach((listener) => listener());
  };

  const wait = () => (latency > 0 ? new Promise((resolve) => setTimeout(resolve, latency + (seq % 3) * 70)) : Promise.resolve());

  async function send(command: ConsoleCommand, as: string, replayOf?: number): Promise<CommandResult> {
    pending = command.action;
    emit();
    await wait();
    const at = now();
    const outcome = execute(state, as, command, at);
    state = outcome.state;
    const entry: ProtocolLogEntry = {
      seq: ++seq, at: iso(at), personaId: as, action: command.action, fn: commandFunction[command.action], projectId: command.projectId,
      ifMatch: command.ifMatch, idempotencyKey: command.idempotencyKey, input: command.input, result: outcome.result, replayOf,
    };
    commands.set(entry.seq, { command, personaId: as });
    log = [entry, ...log].slice(0, LOG_LIMIT);
    pending = null;
    emit();
    return outcome.result;
  }

  return {
    source: "mock",
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    execute: (command) => send(command, personaId),
    async replay(entrySeq) {
      const original = commands.get(entrySeq);
      if (!original) return null;
      return send(original.command, original.personaId, entrySeq);
    },
    tools: {
      start() {
        // Idempotent: React StrictMode runs effects twice (start, stop, start).
        if (startedAt === null) startedAt = Date.now();
        // Re-render only when a deadline is crossed; countdowns tick on their own.
        timer ??= setInterval(() => { if (expirySignature(state, now()) !== expiry) emit(); }, 1000);
      },
      stop() {
        if (timer) clearInterval(timer);
        timer = null;
      },
      now,
      setPersona(id) {
        if (!personas.some((persona) => persona.id === id) || id === personaId) return;
        personaId = id;
        emit();
      },
      advanceClock(ms) {
        skipped += ms;
        emit();
      },
      toggleQualification(id) {
        state = toggleQualification(state, id);
        emit();
      },
      async simulateConcurrentEdit(projectId) {
        const view = Object.values(snapshot.views).find((item) => item.id === projectId);
        const editor = view?.members.find((member) => member.personaId !== personaId && member.roles.some((role) => role === "EDITOR" || role === "OWNER"));
        if (!view?.draft.dto || view.draft.head.state !== "DRAFT" || !editor) return null;
        const payload: DraftPayload = JSON.parse(JSON.stringify(view.draft.dto.payload));
        payload.manifest.summary = `${payload.manifest.summary.replace(/（协作者修订 \d+）$/, "")}（协作者修订 ${view.draft.head.revision + 1}）`.slice(0, 500);
        return send({ action: "EDIT_DRAFT", projectId, ifMatch: view.draft.etag, idempotencyKey: `edit_draft_peer${seq + 1}`, input: payload }, editor.personaId);
      },
      reset() {
        state = createSeedState();
        log = [];
        commands.clear();
        skipped = 0;
        if (startedAt !== null) startedAt = Date.now();
        emit();
      },
    },
  };
}
