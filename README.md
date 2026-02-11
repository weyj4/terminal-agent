# terminal-agent

A terminal-based AI coding assistant built with [pi-tui](https://github.com/badlogic/pi-tui) and support for multiple LLM providers. It runs in your terminal, has access to tools like reading files and running commands, and works through tasks in an agentic loop.

## Setup

Requires Node.js 18+.

```sh
npm install
```

Set your API key for your chosen provider:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GEMINI_API_KEY=...
```

## Usage

```sh
# Development (hot reload)
npm run dev

# With a specific provider
npm run dev -- --provider openai
npm run dev -- --provider gemini

# Build and run
npm run build
npm start
```

Type a message and press enter. Ctrl+C to quit.

Destructive tools (`write_file`, `edit_file`, `run_command`) prompt for confirmation before executing. Press `y` to allow, `n` to deny.

## Project Structure

```
src/
  cli.ts              # Entry point — parses args, starts the app
  app.ts              # TUI — message history, input, tool output, confirmations
  agent/
    claude-agent.ts   # Anthropic agentic loop (Claude Opus 4)
    openai-agent.ts   # OpenAI agentic loop (GPT-5.2)
    gemini-agent.ts   # Google agentic loop (Gemini 2.5 Flash)
    claude-tools.ts   # Tool specs for Anthropic format
    openai-tools.ts   # Tool specs for OpenAI format
    gemini-tools.ts   # Tool specs for Gemini format
  tools/
    handlers.ts       # Shared tool implementations
  prompts/
    index.ts          # System prompt
  utils/
    truncate.ts       # Output truncation for tool results
```

## Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create/overwrite files with auto-directory creation |
| `edit_file` | Find-replace with uniqueness validation |
| `ls` | List directory contents |
| `find_files` | Glob pattern search via `fd` |
| `grep` | Content search via ripgrep/grep |
| `run_command` | Shell execution with timeout and output caps |

See [tools.md](tools.md) for design decisions.

## Testing

```sh
npm test
```

## Stack

- **Runtime**: Node.js + TypeScript
- **UI**: [pi-tui](https://github.com/badlogic/pi-tui)
- **LLM**: Claude via [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript), GPT via [openai](https://github.com/openai/openai-node), Gemini via [@google/genai](https://github.com/googleapis/js-genai)
- **Build**: tsup + tsx
- **Test**: vitest

## Roadmap

### Tier 1 — High impact, contained scope

- [ ] **Diff output for `edit_file`** — Return a unified diff in the tool result instead of just "Successfully edited". Gives the LLM and user visibility into what changed.
- [ ] **Fuzzy matching for `edit_file`** — Normalize smart quotes, whitespace, and Unicode before matching. LLMs frequently emit slightly different characters than what's in the file.
- [ ] **`--model` flag** — Allow overriding the default model from CLI (e.g., `--model claude-sonnet-4-20250514`).

### Tier 2 — Core agent longevity

- [ ] **Context compaction** — When conversation exceeds a token threshold, summarize older turns to stay within context limits.
- [ ] **Conversation handoff** — When context is full, start a fresh conversation with a summary carried over for indefinite sessions.
- [ ] **Stream cancellation** — Ctrl+C during a response should abort the current stream and return to the editor, not kill the process.

### Tier 3 — Polish

- [ ] **`read_file` pagination** — Add offset/limit params so the LLM can read large files in chunks.
- [ ] **Render throttling** — Coalesce TUI updates to 16–33ms to prevent flicker during fast streaming.
- [ ] **VirtualTerminal tests** — Test the TUI layer using pi-tui's VirtualTerminal.
- [ ] **Auto-approve mode** — A `--yes` flag to skip confirmation prompts for scripted/trusted usage.

### Tier 4 — Advanced

- [ ] **Interleaved tool execution** — Execute tools as they stream in rather than waiting for the full response.
- [ ] **Streaming test infrastructure** — Injectable async generators for testing stream behavior with mocked chunks.
- [ ] **Token counting** — Track approximate conversation size to trigger compaction proactively.
