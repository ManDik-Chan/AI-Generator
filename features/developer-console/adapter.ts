/*
 * The seam between the console screens and a Registry backend.
 *
 * Screens read one ConsoleSnapshot and send ConsoleCommands; they never know which adapter
 * is behind them. `source` is shown on every screen. Persona switching and the environment
 * tools exist only on the mock (`tools`); a real adapter sets `tools: null`, and the UI then
 * hides them and acts as the signed-in user.
 */
import type {
  CommandResult,
  ConsoleCommand,
  ConsolePersona,
  ConsoleProjectView,
  ProjectSummary,
  ProtocolLogEntry,
} from "@/features/developer-console/model";

export type ConsoleSource = "mock" | "registry";

export interface ConsoleSnapshot {
  source: ConsoleSource;
  /** Acting identity. On a real adapter this is always the signed-in user. */
  personaId: string;
  personas: ConsolePersona[];
  /** Internal operator qualification per persona (gate 2). */
  qualified: Record<string, boolean>;
  /** Clock used for deadlines; the mock's clock starts at a fixed date. */
  now: number;
  summaries: ProjectSummary[];
  /** Keyed by slug. */
  views: Record<string, ConsoleProjectView>;
  /** Newest first. */
  log: ProtocolLogEntry[];
  /** Action of the command in flight, if any. */
  pending: ConsoleCommand["action"] | null;
}

export interface MockTools {
  /** Starts the mock clock; call once the page is interactive. */
  start(): void;
  stop(): void;
  now(): number;
  setPersona(personaId: string): void;
  /** Moves the mock clock forward, e.g. past a 15-minute review deadline. */
  advanceClock(ms: number): void;
  /** Revokes or restores a persona's internal operator qualification. */
  toggleQualification(personaId: string): void;
  /** Another member saves the draft, so the ETag this tab holds becomes stale. */
  simulateConcurrentEdit(projectId: string): Promise<CommandResult | null>;
  reset(): void;
}

export interface ConsoleAdapter {
  readonly source: ConsoleSource;
  readonly tools: MockTools | null;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConsoleSnapshot;
  getServerSnapshot(): ConsoleSnapshot;
  execute(command: ConsoleCommand): Promise<CommandResult>;
  /** Sends a logged write again with the same key, body and ETag. */
  replay(seq: number): Promise<CommandResult | null>;
}

/** Client-generated Idempotency-Key, matching the protocol's ^[A-Za-z0-9_-]{1,128}$. */
export function newIdempotencyKey(action: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "").slice(0, 16) : Math.random().toString(36).slice(2, 18);
  return `${action.toLowerCase()}_${random}`;
}
