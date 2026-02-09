import type OpenAI from "openai";
import { type ToolHandler, readFileHandler, runCommandHandler } from '../tools/handlers.js';

type FunctionTool = Extract<OpenAI.Responses.Tool, { type: 'function' }>;

export type ToolDefinition = {
	spec: FunctionTool;
	handler: ToolHandler;
};

export const tools: ToolDefinition[] = [
  {
    spec: {
      type: "function",
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to read"
          }
        },
        required: ["path"]
      },
      strict: false
    },
    handler: readFileHandler
  },
  {
    spec: {
      type: "function",
      name: "run_command",
      description: "Execute a bash command in the terminal. Use this to run scripts, install dependencies, run tests, or check system status. Returns both standard output (stdout) and standard error (stderr).",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The full shell command to execute, e.g., 'ls -la' or 'git status'."
          }
        },
        required: ["command"]
      },
      strict: false
    },
    handler: runCommandHandler
  }
]

export const toolSpecs = tools.map(t => t.spec);

export function getToolHandler(name: string): ToolHandler | undefined {
  return tools.find(t => t.spec.name === name)?.handler;
}
