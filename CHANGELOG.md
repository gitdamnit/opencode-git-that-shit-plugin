# Changelog

All notable changes to Git That Shit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-13

### Fixed
- **Shadow repo initialization**: Replaced `git.isGitRepo()` (which walks up to parent `.git`) with strict `hasOwnGitDir()` check requiring own `.git` directory at shadow path. Prevents false "already initialized" when project has a parent git repo.
- **CLI init idempotency**: Second `gts init` now correctly prints "Git That Shit already initialized" instead of re-initializing.
- **CLI list output format**: Changed from "Recent N snapshot(s):" to "Showing N snapshot:" for consistency.
- **Tracker glob regex**: Fixed leading-dot glob pattern generation (`pattern.slice(1)` → `pattern.slice(2)`) to prevent double-dot regex corruption.
- **Detector regex anchors**: Removed trailing `$` from all 17 `RISKY_PACKAGE_MANAGER` patterns so commands like `bun add lodash`, `yarn remove express` match correctly.
- **Git config flags**: Changed `["config", "local", ...]` → `["config", "--local", ...]` in `setLocalConfig` and `getLocalConfig`.
- **Lock file directory**: Added `ensureDir` before `writeFile` in `acquireLock` to prevent ENOENT on missing directories.
- **Snapshot file collection**: Removed redundant `.git-that-shit/` directory scan that was finding shadow repo snapshot copies and causing false "changes detected" on second snapshot.
- **Restore functions**: Exported `dryRunRestore`; added shadow-internal file filtering (`.git-that-shit/`, `.gitignore`) from restore results; added manifest hash validation for bad hash error handling.
- **Manifest git tracking**: Added `.git-that-shit/manifest.jsonl` to shadow repo `.gitignore` to prevent manifest appends from triggering spurious commits.
- **findFiles directory exclusion**: Added `.git-that-shit` to excluded directories to prevent walking into shadow repo during file discovery.

### Tests
- All 238 tests passing (20 CLI, 29 tracker, 6 restore, 14 snapshot, plus security, detector, config, disk, git, lock, manifest, paths, redactor).
- Updated `listSnapshots` test to modify file between snapshots for realistic scenario.
- Updated CLI `snapshot` tests to modify files between init and snapshot.
- Updated tracker `.env` test to verify hard-exclude wins over `allowSensitiveFiles`.

## [0.1.0] - 2026-05-12

### Added
- **Initial release** - Git That Shit v0.1.0
- Shadow git repository for CheapCode/OpenCode config and state snapshots
- CLI binary `gts` with 9 commands: status, list, diff, restore, snapshot, prune, config, init, doctor
- OpenCode-compatible plugin export `GitThatShitPlugin`
- Destructive operation detection with true/false positive distinction
- Restore dry-run safety model with explicit `--yes` confirmation required
- Secret exclusion and redaction policy — `.env` excluded by default
- Snapshot manifest design (`.git-that-shit/manifest.jsonl`)
- Doctor command for comprehensive health diagnostics
- Hook timing verification for `file.edited`
- Cross-platform support: Windows, Linux, macOS
- 8 plugin tools: `gts_status`, `gts_list`, `gts_diff`, `gts_restore`, `gts_snapshot`, `gts_prune`, `gts_config`, `gts_doctor`
- Pre-operation, pre-risky-op, session-start, post-compact, manual, and pre-restore snapshot types
- Lock file mechanism for concurrency safety
- Configurable include/exclude patterns
- Disk space and file size safety checks

### Fixed
- Glob pattern handling for `**` (double star) in file matching
- CLI command dynamic import issues

### Known Limitations
- Hook timing: `file.edited` hook timing must be verified. If it fires after writes, Git That Shit uses it as a post-edit checkpoint only.
- No unsafe history rewriting: Rebase/reset of shadow repo not implemented in v0.1
- No cloud sync: Local git only
- Prune command: Preview functionality only, actual pruning not implemented in v0.1