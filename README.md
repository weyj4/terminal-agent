# terminal-agent

A terminal-based AI coding assistant built with [Ink](https://github.com/vadimdemedes/ink) and the [Anthropic API](https://docs.anthropic.com/). It runs in your terminal, has access to tools like reading files and running commands, and works through tasks in an agentic loop.

Early stage — see the [Roadmap](./ROADMAP.md) for where this is headed.

## Setup

Requires Node.js 18+ and an [Anthropic API key](https://console.anthropic.com/).

```sh
npm install
```

Set your API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```sh
# Development (hot reload)
npm run dev

# Build and run
npm run build
npm start
```

Then type a message and press enter. Ctrl+C to quit.

## Project Structure

```
src/
  cli.tsx        # Entry point — renders the Ink app
  app.tsx        # UI — message history, input, tool output
  agent/
    index.ts     # Agentic loop — sends messages, handles tool use cycles
  tools/
    index.ts     # Tool definitions and handlers
```

## TODO
- implement Skills
- BOM/CRLF normalization for editFile
- fuzzy search, diffs for editFile
- truncate tool output (so we don't blow context)
- "spinners" for "thinking"
- Choose model
- Streaming responses
- Prompt caching
- Visibility into cost

## Stack

- **Runtime**: Node.js + TypeScript
- **UI**: [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
- **LLM**: Claude via [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript)
- **Build**: tsup + tsx
