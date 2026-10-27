import { readFileSync } from "node:fs";

// Never print the raw startup log: it may contain local service credentials.
const log = readFileSync(process.argv[2], "utf8");
const categories = [
  [/no space left on device|disk quota exceeded/i, "runner disk space exhausted"],
  [/too many requests|rate limit|toomanyrequests/i, "container registry rate limit"],
  [/failed to pull|error pulling|pull access denied|manifest unknown|image not found/i, "container image pull failed"],
  [/timeout|timed out|deadline exceeded/i, "startup or network timeout"],
  [/connection refused|cannot connect to the docker daemon|is the docker daemon running/i, "container service connection failed"],
  [/address already in use|port is already allocated/i, "local service port already in use"],
  [/unhealthy|health check|healthcheck/i, "container health check failed"],
  [/permission denied|unauthorized|authentication required/i, "permission or registry authentication failed"],
  [/no such host|temporary failure in name resolution|lookup .*:.*dns/i, "DNS lookup failed"],
];
const matches = categories.filter(([pattern]) => pattern.test(log)).map(([, label]) => label);
console.error(`Supabase startup diagnostics: ${matches.join("; ") || "unclassified failure (raw log withheld)"}`);
