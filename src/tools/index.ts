import type Anthropic from "@anthropic-ai/sdk";
import { readFile as fsReadFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type ToolHandler = (
	input: Record<string, string>,
) => Promise<string>;

export type ToolDefinition = {
	spec: Anthropic.Messages.Tool;
	handler: ToolHandler;
};

const readFileHandler: ToolHandler = async (input) => {
  const path = input.path;

  try {
    const content = await fsReadFile(path, 'utf-8');
    return content;
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Error: File '${path}' not found`;
      }
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return `Error: Permission denied for '${path}'`;
      }
      return `Error: ${error.message}`;
    }
    return `Error: Unknown error reading file: '${path}'`
  }
};

const runCommandHandler: ToolHandler = async (input) => {
  const command = input.command;

  console.log(`\x1b[92m[Executing Bash]\x1b[0m: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });

    let output = '';
    if (stdout) {
      output += `STDOUT: \n${stdout}\n`;
    }
    if (stderr) {
      output += `STDERR: \n${stderr}\n`
    }

    if (!output) {
      return `Command executed successfully (no output).`;
    }

    return output;
  } catch (error) {
    if (error instanceof Error) {
      if ((error as any).killed) {
        return 'Error: The command timed out.';
      }

      const execError = error as any;
      let output = '';
      if (execError.stdout) {
        output += `STDOUT:\n${execError.stdout}\n`;
      }
      if (execError.stderr) {
        output += `STDERR:\n${execError.stderr}\n`;
      }
      if (output) {
        return output;
      }

      return `Error: ${error.message}`;
    }
    return 'Error: Unknown error executing command';
  }


}

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
        require: ["path"]
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
        require: ["command"]
      }
    },
    handler: runCommandHandler
  }
]

export const toolSpecs = tools.map(t => t.spec);

export function getToolHandler(name: string): ToolHandler | undefined {
  return tools.find(t => t.spec.name === name)?.handler;
}
