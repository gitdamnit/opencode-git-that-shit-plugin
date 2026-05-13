import { resolveProjectRoot } from "../../shared/paths.js";
import * as snapshot from "../../engine/snapshot.js";

export default async function diffCommand(args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  if (args.length === 0) {
    console.error("Usage: gts diff <hash>");
    process.exit(1);
  }

  const hash = args[0];

  try {
    const diff = await snapshot.getSnapshotDiff(projectRoot, hash);

    if (!diff) {
      console.log("No changes in this snapshot.");
      return;
    }

    console.log(diff);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}