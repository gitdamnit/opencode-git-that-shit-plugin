import { resolveProjectRoot } from "../../shared/paths.js";
import * as manifest from "../../engine/manifest.js";
import { getShadowRepoPath } from "../../shared/paths.js";

export default async function pruneCommand(args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  let keep = 50;
  let dryRun = true;

  for (const arg of args) {
    if (arg.startsWith("-k=") || arg.startsWith("--keep=")) {
      keep = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--yes") {
      dryRun = false;
    }
  }

  const snapshots = await manifest.readManifest(projectRoot);

  if (snapshots.length <= keep) {
    console.log(`Nothing to prune. ${snapshots.length} snapshots, keeping ${keep}.`);
    return;
  }

  const toDelete = snapshots.slice(0, snapshots.length - keep);
  const toKeep = snapshots.slice(snapshots.length - keep);

  console.log(`Would delete ${toDelete.length} snapshot(s), keeping ${toKeep.length}.\n`);

  for (const snap of toDelete) {
    console.log(`  Would delete: ${snap.shortHash} - ${snap.reason}`);
  }

  if (dryRun) {
    console.log("\nDry-run mode. Use --yes to actually prune.");
    return;
  }

  console.log("\nPruning is not implemented in v0.1.");
  console.log("Use git directly on the shadow repo if needed:");
  console.log(`  cd ${getShadowRepoPath(projectRoot)}`);
  console.log("  git reflog ... or git reset --hard <hash>");
}