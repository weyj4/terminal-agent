import type Anthropic from "@anthropic-ai/sdk";
import { type ToolHandler, readFileHandler, writeFileHandler, editFileHandler, runCommandHandler } from '../tools/handlers.js';

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
      name: "write_file",
      description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to write to"
          },
          content: {
            type: "string",
            description: "The content to write to the file"
          }
        },
        required: ["path", "content"]
      }
    },
    handler: writeFileHandler
  },
  {
    spec: {
      name: "edit_file",
      description: "Edit an existing file by replacing a specific section of text. The old text must match exactly and be unique within the file.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The file path to edit"
          },
          oldText: {
            type: "string",
            description: "The existing text to find and replace. Must match exactly and be unique in the file."
          },
          newText: {
            type: "string",
            description: "The new text to replace the old text with"
          }
        },
        required: ["path", "oldText", "newText"]
      }
    },
    handler: editFileHandler
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
