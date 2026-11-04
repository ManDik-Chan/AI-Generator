export const STRUCTURE_SQL: string;
export const KNOWN_VARIANTS: Map<string, { rule: "sql" } | { rule: "pinned"; migrated: string; restored: string }>;
export function isKnownVariant(identity: string, expected: string, actual: string): boolean;
export type RestoreSnapshot = {
  definitions: Map<string, { attributes: string; source: string }>;
  facts: Set<string>;
};
export function parseSnapshot(output: string): RestoreSnapshot;
export function compareRestore(
  expected: RestoreSnapshot,
  actual: RestoreSnapshot,
  options?: { allowVariants?: boolean },
): { differences: string[]; variants: string[] };
export function main(): Promise<void>;
