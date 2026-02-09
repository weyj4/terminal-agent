import type Anthropic from "@anthropic-ai/sdk";
import { type ToolHandler, readFileHandler, runCommandHandler } from '../tools/handlers.js';

export type ToolDefinition = {
	spec: Anthropic.Messages.Tool;
	handler: ToolHandler;
};

export const tools: ToolDefinition[] = [
  {
    spec: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to read"
          }
        },
        required: ["path"]
      }
    },
    handler: readFileHandler
  },
  {
    spec: {
      name: "run_command",
      description: "Execute a bash command in the terminal. Use this to run scripts, install dependencies, run tests, or check system status. Returns both standard output (stdout) and standard error (stderr).",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The full shell command to execute, e.g., 'ls -la' or 'git status'."
          }
        },
        required: ["command"]
      }
    },
    handler: runCommandHandler
  }
]

export const toolSpecs = tools.map(t => t.spec);

export function getToolHandler(name: string): ToolHandler | undefined {
  return tools.find(t => t.spec.name === name)?.handler;
}
