export const SNAPSHOT_SQL: string;
export function buildScript(baseline: string): string;
export function normalizeSql(source: string): string;
export function compareSnapshots(output: string): {
  differences: string[];
  lexicalOnly: string[];
  facts: number;
  policies: number;
  tables: number;
  functions: number;
  triggers: number;
};
export function main(): void;
