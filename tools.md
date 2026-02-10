# Tools

All tool handlers live in `src/tools/handlers.ts`. Tool specs (JSON schemas for the LLM) are defined per-provider in `src/agent/claude-tools.ts` and `src/agent/openai-tools.ts`.

This document covers each tool and the design decisions behind it, particularly where we drew from [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/src/core/tools) by Mario Zechner.

---

## Shared Patterns

### Path Resolution

Every file-oriented handler resolves paths with `resolve(process.cwd(), input.path)`. This is critical because the agent is installed globally via `npm link` and invoked from arbitrary directories. The LLM will typically emit relative paths like `src/utils/helpers.ts` — without explicit resolution, these would resolve unpredictably.

Pi does the same thing with a `resolveToCwd()` utility. We inline it since we don't need the abstraction.

### Error Handling

All handlers return error strings rather than throwing. This keeps errors in the LLM conversation as tool results, so the model can recover and retry. A thrown exception would bubble up and crash the agent loop.

---

## `read_file`

Reads a file and returns its contents as UTF-8 text.

**No notable design decisions beyond path resolution.** Pi's version adds BOM stripping (Byte Order Mark — an invisible Unicode prefix added by some Windows editors) and line ending normalization. We skip this since we're on macOS and unlikely to encounter BOM-prefixed files.

---

## `write_file`

Writes content to a file, creating it if it doesn't exist.

### Automatic Directory Creation

A naive implementation would just call `writeFile` and fail with `ENOENT` if the parent directory doesn't exist. Following Pi, we call `mkdir(dir, { recursive: true })` before every write. This means the LLM can write to `src/new/deeply/nested/file.ts` without needing to create the directory structure first.

The `recursive: true` flag makes this a no-op when the directory already exists, so there's no cost for the common case.

---

## `edit_file`

Edits an existing file by finding and replacing a specific section of text.

### Why Edit Exists Separately from Write

This is the most important architectural decision, drawn directly from Pi. Without `edit_file`, the LLM has two options for modifying a file:

1. **Rewrite the entire file via `write_file`** — wasteful, error-prone, and the LLM must reproduce every line perfectly.
2. **Use `sed` via `run_command`** — opaque to the agent (no visibility into what changed), fragile with regex escaping, and the agent can't add diffing, undo, or confirmation later.

With `edit_file`, the LLM specifies only the chunk it wants to change (`oldText` → `newText`). The handler reads the file, performs the replacement, and writes it back. This keeps edits surgical and the operation visible to the agent's tool pipeline.

### Uniqueness Validation

A naive search-and-replace would just replace the first match. Pi enforces that `oldText` must be **unique** within the file — if there are multiple matches, the tool rejects the edit and tells the LLM to provide more surrounding context. This prevents the LLM from accidentally editing the wrong occurrence of a common pattern.

### What We Skipped from Pi

- **Fuzzy matching** — Pi normalizes smart quotes (`"` → `"`), em dashes, and Unicode spaces before matching. This handles cases where the LLM emits slightly different characters than what's in the file. We use exact match for now; worth revisiting if match failures become common.
- **BOM/CRLF normalization** — Pi strips BOM and normalizes line endings to `\n` before matching, then restores the original style after replacement. Not needed on macOS with our own files.
- **Diff generation** — Pi returns a unified diff in the tool result. We return a simple success message.

---

## `ls`

Lists directory contents with alphabetical sorting and directory indicators.

### Why a Dedicated Tool

The LLM could just run `ls` via `run_command`, but a dedicated tool gives us structured, consistent output. The format is always the same: sorted alphabetically (case-insensitive), directories suffixed with `/`. No shell formatting differences, no color codes, no locale-dependent sorting.

This also keeps directory listing in the tool pipeline — we could add filtering, truncation, or caching later without changing the LLM's interface.

### Graceful Stat Failures

When iterating entries, if an individual `stat` call fails (broken symlink, permission issue), we include the entry without the `/` suffix rather than failing the entire listing. Pi does the same — resilience over strictness.

### Validation via `stat`

We don't separately check if the path exists using `existsSync`. Instead, `stat` serves double duty: if it throws `ENOENT`, the path doesn't exist; if it succeeds, we check `isDirectory()`. Pi uses `existsSync` because it works synchronously inside a manual Promise wrapper, but since we're fully async, `stat` is cleaner.

---

## `find_files`

Searches for files by glob pattern, returning relative paths.

### Default Exclusions

Excludes `node_modules/` and `.git/` from results. Without this, a search for `*.ts` in a typical project would return thousands of irrelevant results from dependencies, blowing up the LLM's context window. Pi achieves the same thing by respecting `.gitignore` via `fd`.

### Relative Path Output

Results are returned as paths relative to the search directory, not absolute paths. This keeps output concise and matches what the LLM expects to pass to other tools.

### Result Cap

Piped through `head -1000` to prevent unbounded output. Pi does the same with a configurable limit (default 1000).

### What We Skipped from Pi

- **`fd` integration** — Pi downloads and uses `fd` (a fast `find` alternative) with `.gitignore` support. We use the system `find` command, which is available everywhere on macOS/Linux without extra dependencies.
- **Pluggable operations** — Pi's `FindOperations` interface allows swapping in remote glob implementations. Not needed for a local-only agent.

---

## `run_command`

Executes a bash command and returns the output.

### `spawn` Instead of `exec`

A naive approach uses `exec`, which buffers the entire output in memory before returning. Following Pi, we use `spawn` with streaming. This matters for long-running or verbose commands — `exec` would hit its `maxBuffer` limit and kill the process, while `spawn` lets us cap output gracefully.

### Process Tree Killing

We spawn with `detached: true` and kill with `process.kill(-pid, 'SIGKILL')` (note the negative PID). This kills the entire process group — the shell and all its children. Without this, killing a `bash -c "npm test"` would kill bash but leave the test runner orphaned.

### Output Truncation

Output is capped at 100KB (`MAX_OUTPUT_BYTES`). Without this, a command like `cat large-file.txt` or a verbose build log could dump megabytes into the LLM's context window, wasting tokens and degrading response quality. Pi implements more sophisticated truncation with temp file streaming for very large outputs; our simple cap is sufficient for now.

### Timeout Reporting

On timeout, we include the duration in the output: `[Timed out after 30s]`. This tells the LLM *why* the command was interrupted and how long it ran, so it can adjust (e.g., add a timeout flag, try a different approach). A naive implementation just returns "timed out" with no context.

### Exit Code Reporting

Non-zero exit codes are appended as `[Exit code: N]`. The LLM needs this to distinguish between a command that produced output and succeeded versus one that produced output and failed (e.g., a test runner that prints results then exits with code 1).

### Shared `runShell` Utility

The `runShell` function is extracted and reused by `findFilesHandler`. This avoids duplicating the spawn/timeout/truncation logic.

---

## What We Deliberately Skipped from Pi

These Pi features add complexity we don't need for a single-user local CLI agent:

| Feature | Pi's Use Case | Why We Skip It |
|---|---|---|
| **Pluggable operations** | SSH, remote filesystems | Local-only agent |
| **AbortSignal support** | Cancel button in UI, concurrent tools | Single tool at a time, no cancel UI |
| **TypeBox schemas** | Runtime validation, type generation | JSON schemas in spec files suffice |
| **Factory pattern** (`createWriteTool`) | Multiple instances with different cwds | Single instance per handler |
| **Structured return types** | Rich metadata for TUI rendering | Plain string returns are sufficient |
| **Temp file streaming** | Gigabyte-scale command output | 100KB cap handles our cases |
