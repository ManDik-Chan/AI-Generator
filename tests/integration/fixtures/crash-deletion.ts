// Test-only child process: die after real Storage acknowledgement, before DB ack.
import { performDeletion, deletePendingObjectBytes } from "../../../features/storage/deletion";
import { prisma } from "../../../lib/database/prisma";
async function main() {
  const id = process.argv[2];
  const task = await prisma.assetDeletion.findUniqueOrThrow({ where: { id } });
  await performDeletion(id, async () => {
    await deletePendingObjectBytes(task.bucket, task.path);
    process.exit(73);
  });
}
main().catch(() => { process.exitCode = 74; });
