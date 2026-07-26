import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

export const integrationDatabaseEnabled = Boolean(
  databaseUrl
  && process.env.ALLOW_TEST_DATABASE_MUTATIONS === "true"
  && process.env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION === "true",
);

if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !integrationDatabaseEnabled) {
  throw new Error(
    "Security acceptance requires a disposable migrated TEST_DATABASE_URL and both explicit mutation safety flags; "
    + "real PostgreSQL/RLS security tests must not be skipped.",
  );
}

if (
  process.env.REQUIRE_SECURITY_TEST_DATABASE === "true"
  && process.env.DATABASE_URL?.trim() !== databaseUrl
) {
  throw new Error(
    "Security acceptance requires DATABASE_URL and TEST_DATABASE_URL to reference "
    + "the same disposable database so production transaction kernels cannot escape the test database.",
  );
}

export function createIntegrationPrisma() {
  if (!integrationDatabaseEnabled || !databaseUrl) {
    throw new Error(
      "Integration database disabled. Set TEST_DATABASE_URL, ALLOW_TEST_DATABASE_MUTATIONS=true, "
      + "and TEST_DATABASE_CONFIRMED_NON_PRODUCTION=true for a disposable migrated database.",
    );
  }
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
