import * as fs from "fs/promises";
import * as path from "path";
import { getLockPath, ensureDir } from "../shared/paths.js";
import type { LockFile } from "../shared/types.js";
import { LockError } from "../shared/errors.js";

const LOCK_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 3;

export async function acquireLock(
  projectRoot: string,
  operation: string,
  reason: string
): Promise<boolean> {
  const lockPath = getLockPath(projectRoot);
  const pid = process.pid;
  const timestamp = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const existingLock = await readLock(projectRoot);

      if (existingLock) {
        const lockAge = Date.now() - new Date(existingLock.timestamp).getTime();

        if (lockAge < LOCK_TIMEOUT_MS) {
          const isStale = await isLockStale(existingLock);
          if (!isStale) {
            if (attempt < MAX_RETRIES - 1) {
              await sleep(RETRY_DELAY_MS);
              continue;
            }
            throw new LockError(`Lock held by PID ${existingLock.pid}, operation: ${existingLock.operation}`);
          }
        }

        await removeLock(projectRoot);
      }

      const lockFile: LockFile = {
        pid,
        timestamp,
        operation,
        reason,
      };

      ensureDir(path.dirname(lockPath));
      await fs.writeFile(lockPath, JSON.stringify(lockFile, null, 2), "utf-8");
      return true;
    } catch (error) {
      if (error instanceof LockError) {
        throw error;
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new LockError("Failed to acquire lock after max retries");
}

export async function releaseLock(projectRoot: string): Promise<void> {
  const lockPath = getLockPath(projectRoot);

  try {
    await fs.unlink(lockPath);
  } catch {
    // Lock file doesn't exist, that's fine
  }
}

export async function readLock(projectRoot: string): Promise<LockFile | null> {
  const lockPath = getLockPath(projectRoot);

  try {
    const content = await fs.readFile(lockPath, "utf-8");
    return JSON.parse(content) as LockFile;
  } catch {
    return null;
  }
}

export async function isLockStale(lock: LockFile): Promise<boolean> {
  const lockAge = Date.now() - new Date(lock.timestamp).getTime();

  if (lockAge > LOCK_TIMEOUT_MS) {
    return true;
  }

  try {
    process.kill(lock.pid, 0);
    return false;
  } catch {
    return true;
  }
}

export async function isLocked(projectRoot: string): Promise<boolean> {
  const lock = await readLock(projectRoot);

  if (!lock) {
    return false;
  }

  const stale = await isLockStale(lock);
  if (stale) {
    await removeLock(projectRoot);
    return false;
  }

  return true;
}

async function removeLock(projectRoot: string): Promise<void> {
  const lockPath = getLockPath(projectRoot);

  try {
    await fs.unlink(lockPath);
  } catch {
    // Ignore errors
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withLock<T>(
  projectRoot: string,
  operation: string,
  reason: string,
  fn: () => Promise<T>
): Promise<T> {
  await acquireLock(projectRoot, operation, reason);

  try {
    return await fn();
  } finally {
    await releaseLock(projectRoot);
  }
}

export async function cleanupStaleLocks(projectRoot: string): Promise<number> {
  const lock = await readLock(projectRoot);

  if (!lock) {
    return 0;
  }

  const stale = await isLockStale(lock);

  if (stale) {
    await removeLock(projectRoot);
    return 1;
  }

  return 0;
}