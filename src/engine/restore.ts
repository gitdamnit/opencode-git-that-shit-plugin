import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as git from "./git.js";
import * as manifest from "./manifest.js";
import * as lock from "./lock.js";
import { snapshot } from "./snapshot.js";
import { loadConfig, DEFAULT_CONFIG } from "./config.js";
import { getShadowRepoPath, ensureDir, copyFile, fileExists } from "../shared/paths.js";
import type { RestoreSnapshotInput, RestoreResult, RestoreMode } from "../shared/types.js";

export async function restoreSnapshot(input: RestoreSnapshotInput): Promise<RestoreResult> {
  const { projectRoot, hash, mode, yes, force } = input;

  const config = await loadConfig(projectRoot).catch(() => DEFAULT_CONFIG);
  const shadowPath = getShadowRepoPath(projectRoot);

  if (mode === "dry-run") {
    return await dryRunRestore(projectRoot, hash);
  }

  if (config.restore.autoPreRestoreSnapshot && !force) {
    const preRestoreResult = await snapshot({
      projectRoot,
      reason: `pre-restore: restoring to ${hash.slice(0, 7)}`,
      type: "pre-restore",
      trigger: "restore.pre-snapshot",
    });

    if (!preRestoreResult.committed) {
      return {
        mode,
        restored: [],
        wouldRestore: [],
        overwritten: [],
        created: [],
        skipped: [],
        missing: [],
        conflicts: [],
        error: `Pre-restore snapshot failed: ${preRestoreResult.reason}. Use --force to skip.`,
      };
    }
  }

  try {
    await lock.withLock(projectRoot, "restore", `restore to ${hash}`, async () => {
      return await realRestore(projectRoot, hash, mode);
    });

    return await realRestore(projectRoot, hash, mode);
  } catch (error) {
    return {
      mode,
      restored: [],
      wouldRestore: [],
      overwritten: [],
      created: [],
      skipped: [],
      missing: [],
      conflicts: [],
      error: (error as Error).message,
    };
  } finally {
    await lock.releaseLock(projectRoot);
  }
}

function isShadowInternalFile(file: string): boolean {
  return file.startsWith(".git-that-shit/") || file === ".gitignore";
}

export async function dryRunRestore(
  projectRoot: string,
  hash: string
): Promise<RestoreResult> {
  const shadowPath = getShadowRepoPath(projectRoot);

  try {
    const entries = await manifest.readManifest(projectRoot);
    const found = entries.find((e) => e.hash === hash || e.shortHash === hash);
    if (!found) {
      return {
        mode: "dry-run",
        restored: [],
        wouldRestore: [],
        overwritten: [],
        created: [],
        skipped: [],
        missing: [],
        conflicts: [],
        error: `Snapshot hash ${hash} not found in manifest`,
      };
    }

    const snapshotFiles = await git.listFilesAtCommit(shadowPath, hash);

    const wouldRestore: string[] = [];
    const missing: string[] = [];

    for (const file of snapshotFiles) {
      if (isShadowInternalFile(file)) {
        continue;
      }

      wouldRestore.push(file);

      const projectPath = path.join(projectRoot, file);
      if (!fileExists(projectPath)) {
        missing.push(file);
      }
    }

    return {
      mode: "dry-run",
      restored: [],
      wouldRestore,
      overwritten: [],
      created: [],
      skipped: [],
      missing,
      conflicts: [],
    };
  } catch (error) {
    return {
      mode: "dry-run",
      restored: [],
      wouldRestore: [],
      overwritten: [],
      created: [],
      skipped: [],
      missing: [],
      conflicts: [],
      error: (error as Error).message,
    };
  }
}

async function realRestore(
  projectRoot: string,
  hash: string,
  mode: RestoreMode
): Promise<RestoreResult> {
  const shadowPath = getShadowRepoPath(projectRoot);
  const tempDir = mode === "to-temp" ? await fs.mkdtemp(path.join(os.tmpdir(), "gts-restore-")) : undefined;

  const restored: string[] = [];
  const overwritten: string[] = [];
  const created: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const missing: string[] = [];
  const conflicts: string[] = [];

  try {
    const snapshotFiles = await git.listFilesAtCommit(shadowPath, hash);

    for (const file of snapshotFiles) {
      if (file.startsWith("global-opencode/")) {
        skipped.push({ path: file, reason: "global config skipped in restore" });
        continue;
      }

      const content = await git.getFileAtCommit(shadowPath, hash, file);

      if (mode === "to-temp" && tempDir) {
        const destPath = path.join(tempDir, file);
        ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, content, "utf-8");
        restored.push(file);
        continue;
      }

      const projectPath = path.join(projectRoot, file);
      const exists = fileExists(projectPath);

      if (exists) {
        const existingContent = await fs.readFile(projectPath, "utf-8");
        if (existingContent !== content) {
          conflicts.push(file);
        }
        overwritten.push(file);
      } else {
        created.push(file);
      }

      ensureDir(path.dirname(projectPath));
      await fs.writeFile(projectPath, content, "utf-8");
      restored.push(file);
    }

    return {
      mode,
      restored,
      wouldRestore: [],
      overwritten,
      created,
      skipped,
      missing,
      conflicts,
      tempDir,
    };
  } catch (error) {
    return {
      mode,
      restored,
      wouldRestore: [],
      overwritten,
      created,
      skipped,
      missing,
      conflicts,
      tempDir,
      error: (error as Error).message,
    };
  }
}

export async function previewRestore(
  projectRoot: string,
  hash: string
): Promise<{
  files: string[];
  missing: string[];
  conflicts: string[];
}> {
  const shadowPath = getShadowRepoPath(projectRoot);

  try {
    const snapshotFiles = await git.listFilesAtCommit(shadowPath, hash);

    const files: string[] = [];
    const missing: string[] = [];
    const conflicts: string[] = [];

    for (const file of snapshotFiles) {
      if (isShadowInternalFile(file)) {
        continue;
      }

      files.push(file);

      const projectPath = path.join(projectRoot, file);
      if (!fileExists(projectPath)) {
        missing.push(file);
      } else {
        const projectContent = await fs.readFile(projectPath, "utf-8");
        const snapshotContent = await git.getFileAtCommit(shadowPath, hash, file);
        if (projectContent !== snapshotContent) {
          conflicts.push(file);
        }
      }
    }

    return { files, missing, conflicts };
  } catch (error) {
    return { files: [], missing: [], conflicts: [] };
  }
}

export async function getRestoreTarget(
  projectRoot: string,
  hashOrShort: string
): Promise<string | null> {
  const entries = await manifest.readManifest(projectRoot);

  const exact = entries.find((e) => e.hash === hashOrShort || e.shortHash === hashOrShort);

  if (exact) {
    return exact.hash;
  }

  if (hashOrShort.length >= 7) {
    const shortMatch = entries.find((e) => e.shortHash === hashOrShort);
    if (shortMatch) {
      return shortMatch.hash;
    }
  }

  return null;
}