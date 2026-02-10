import type Anthropic from "@anthropic-ai/sdk";
import { type ToolHandler, readFileHandler, writeFileHandler, editFileHandler, lsHandler, findFilesHandler, grepHandler, runCommandHandler } from '../tools/handlers.js';

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
      name: "ls",
      description: "List directory contents. Returns entries sorted alphabetically with '/' suffix for directories.",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory to list (default: current directory)"
          }
        },
        required: []
      }
    },
    handler: lsHandler
  },
  {
    spec: {
      name: "find_files",
      description: "Search for files by glob pattern. Returns matching file paths relative to the search directory. Excludes node_modules and .git.",
      input_schema: {
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
      }
    },
    handler: findFilesHandler
  },
  {
    spec: {
      name: "grep",
      description: "Search file contents for a pattern using ripgrep (rg) if available, otherwise grep. Returns matching lines with file paths and line numbers.",
      input_schema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "The regex pattern to search for"
          },
          path: {
            type: "string",
            description: "Directory or file to search in (default: current directory)"
          },
          include: {
            type: "string",
            description: "File glob to filter, e.g. '*.ts' or '*.py'"
          }
        },
        required: ["pattern"]
      }
    },
    handler: grepHandler
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
