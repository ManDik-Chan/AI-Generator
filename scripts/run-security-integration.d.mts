export interface IntegrationReport {
  success: boolean;
  numTotalTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  testResults: { name: string; status: string; assertionResults: { status: string }[] }[];
}
export function discoverIntegrationFiles(root: string): string[];
export function verifyIntegrationReport(root: string, expected: string[], report: IntegrationReport): { suites: number; tests: number };
export function requireIsolatedEnvironment(env: Record<string, string | undefined>): void;
export function main(): void;
