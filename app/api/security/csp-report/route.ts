import { createCspReportHandler } from "@/lib/security/csp-report";

export const runtime = "nodejs";
export const POST = createCspReportHandler();
