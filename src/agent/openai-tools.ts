import type OpenAI from "openai";
import { type ToolHandler, readFileHandler, writeFileHandler, editFileHandler, lsHandler, findFilesHandler, runCommandHandler } from '../tools/handlers.js';

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
      name: "write_file",
      description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
      parameters: {
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
      },
      strict: false
    },
    handler: writeFileHandler
  },
  {
    spec: {
      type: "function",
      name: "edit_file",
      description: "Edit an existing file by replacing a specific section of text. The old text must match exactly and be unique within the file.",
      parameters: {
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
      },
      strict: false
    },
    handler: editFileHandler
  },
  {
    spec: {
      type: "function",
      name: "ls",
      description: "List directory contents. Returns entries sorted alphabetically with '/' suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory to list (default: current directory)"
          }
        },
        required: []
      },
      strict: false
    },
    handler: lsHandler
  },
  {
    spec: {
      type: "function",
      name: "find_files",
      description: "Search for files by glob pattern. Returns matching file paths relative to the search directory. Excludes node_modules and .git.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to match files, e.g. '*.ts', '*.json'"
          },
          path: {
            type: "string",
            description: "Directory to search in (default: current directory)"
          }
        },
        required: ["pattern"]
      },
      strict: false
    },
    handler: findFilesHandler
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
