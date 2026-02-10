# Pi Coding Agent - Atomic Ops

## File CRUD

| Tool | Implementation | Notes |
|------|---------------|-------|
| **read** | Native `fs.readFile` | Supports text + images (auto-resize). Pagination via `offset`/`limit`. No CLI wrapper. |
| **write** | Native `fs.writeFile` | Creates parent dirs automatically. Full overwrite only. |
| **edit** | Native `fs.readFile` + `fs.writeFile` | Find-and-replace with fuzzy matching (handles whitespace differences). Generates diffs. |

**Delete** - Not a separate tool. You'd use `bash rm` for that.

## Search/Navigation

| Tool | Implementation | Notes |
|------|---------------|-------|
| **grep** | **ripgrep (`rg`)** wrapper | JSON output mode, auto-downloads if missing via `ensureTool()` |
| **find** | **fd** wrapper | Glob-based file finder, respects .gitignore, auto-downloads if missing |
| **ls** | Native `fs.readdirSync` | Pure Node, no CLI dependency |

## Escape Hatch

| Tool | Implementation | Notes |
|------|---------------|-------|
| **bash** | `child_process.spawn` | Generic shell execution with timeout, output streaming, truncation. The "do anything" fallback. |

## Key Design Patterns

1. All tools have **pluggable operations interfaces** (`ReadOperations`, `WriteOperations`, etc.) for remote execution (SSH, etc.)
2. All output is **truncated** to ~30KB / 500-1000 lines to avoid blowing context
3. `grep` and `find` use **vendored binaries** (rg, fd) - downloaded on-demand via `ensureTool()`
4. Default tool set is `[read, bash, edit, write]` - `grep`, `find`, `ls` are optional
