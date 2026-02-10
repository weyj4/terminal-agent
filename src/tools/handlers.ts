import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type ToolHandler = (
	input: Record<string, string>,
) => Promise<string>;

export const readFileHandler: ToolHandler = async (input) => {
  const path = resolve(process.cwd(), input.path);

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

export const writeFileHandler: ToolHandler = async (input) => {
  const path = resolve(process.cwd(), input.path);
  const content = input.content;

  try {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    await fsWriteFile(path, content);
    return `Successfully wrote ${content.length} bytes to ${path}`;
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
    return `Error: Unknown error writing file: '${path}'`

  }
};

export const editFileHandler: ToolHandler = async (input) => {
  const path = resolve(process.cwd(), input.path);
  const { oldText, newText } = input;

  try {
    const content = await fsReadFile(path, 'utf-8');

    const matchIndex = content.indexOf(oldText);
    if (matchIndex === -1) {
      return `Error: Could not find the specified text in '${path}'`;
    }

    const secondMatch = content.indexOf(oldText, matchIndex + 1);
    if (secondMatch !== -1) {
      return `Error: Found multiple matches for the specified text in '${path}'. Provide more context to make the match unique.`;
    }

    const updated = content.substring(0, matchIndex) + newText + content.substring(matchIndex + oldText.length);
    await fsWriteFile(path, updated);

    return `Successfully edited ${path}`;
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
    return `Error: Unknown error editing file: '${path}'`;
  }
};

export const runCommandHandler: ToolHandler = async (input) => {
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
};
