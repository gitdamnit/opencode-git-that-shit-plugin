import { resolveProjectRoot, getShadowRepoPath } from "../../shared/paths.js";
import * as git from "../../engine/git.js";
import * as manifest from "../../engine/manifest.js";
import * as config from "../../engine/config.js";

export default async function statusCommand(_args: string[]): Promise<void> {
  const projectRoot = resolveProjectRoot();

  console.log("Git That Shit Status\n");

  const gitAvailable = await git.checkGitAvailable();
  console.log(`Git available: ${gitAvailable ? "✓ Yes" : "✗ No"}`);

  if (!gitAvailable) {
    console.log("\nGit is not installed or not in PATH.");
    process.exit(1);
  }

  const shadowPath = getShadowRepoPath(projectRoot);
  const shadowExists = await git.isGitRepo(shadowPath);

  if (!shadowExists) {
    console.log("Shadow repo: Not initialized");
    console.log("\nRun 'gts init' to initialize.");
    process.exit(0);
  }

  console.log(`Shadow repo: ${shadowPath}`);

  try {
    const snapshots = await manifest.readManifest(projectRoot);
    console.log(`Snapshot count: ${snapshots.length}`);

    if (snapshots.length > 0) {
      const last = snapshots[snapshots.length - 1];
      console.log(`Last snapshot: ${last.shortHash} (${last.type})`);
      console.log(`  Reason: ${last.reason}`);
      console.log(`  Time: ${new Date(last.timestamp).toLocaleString()}`);
    }
  } catch (error) {
    console.log(`Error reading snapshots: ${(error as Error).message}`);
  }

  try {
    const cfg = await config.loadConfig(projectRoot);
    console.log(`\nConfig: .git-that-shit/git-that-shit/config.json`);
    console.log(`  Tracking ${cfg.tracking.include.length} file patterns`);
    console.log(`  Package manager ops: ${cfg.destructiveOps.riskyPackageManagerOps ? "enabled" : "disabled"}`);
  } catch {
    console.log("\nConfig: using defaults");
  }
}