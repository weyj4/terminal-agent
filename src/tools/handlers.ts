import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, readdir, stat } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { spawn } from 'child_process';

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

export const lsHandler: ToolHandler = async (input) => {
  const dirPath = resolve(process.cwd(), input.path || '.');

  try {
    const dirStat = await stat(dirPath);
    if (!dirStat.isDirectory()) {
      return `Error: Not a directory: '${dirPath}'`;
    }

    const entries = await readdir(dirPath);
    entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const results: string[] = [];
    for (const entry of entries) {
      try {
        const entryStat = await stat(join(dirPath, entry));
        results.push(entryStat.isDirectory() ? entry + '/' : entry);
      } catch {
        results.push(entry);
      }
    }

    return results.length === 0 ? '(empty directory)' : results.join('\n');
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return `Error: Path '${dirPath}' not found`;
      }
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return `Error: Permission denied for '${dirPath}'`;
      }
      return `Error: ${error.message}`;
    }
    return `Error: Unknown error listing directory: '${dirPath}'`;
  }
};

export const findFilesHandler: ToolHandler = async (input) => {
  const searchPath = resolve(process.cwd(), input.path || '.');
  const pattern = input.pattern;

  try {
    const result = await runShell(
      `fd --glob --color=never --hidden --max-results 1000 '${pattern}' '${searchPath}'`,
      { timeout: 10000 }
    );

    const lines = result.output.trim();
    if (!lines) return 'No files found matching pattern';

    const results = lines.split('\n').map(p =>
      p.startsWith(searchPath + '/') ? p.slice(searchPath.length + 1) : p
    );

    return results.join('\n');
  } catch (error) {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return `Error: Unknown error searching for files`;
  }
};

const MAX_OUTPUT_BYTES = 100 * 1024;
const DEFAULT_TIMEOUT = 30000;

function runShell(
  command: string,
  options: { timeout?: number; cwd?: string } = {}
): Promise<{ output: string; exitCode: number }> {
  const { timeout = DEFAULT_TIMEOUT, cwd } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (proc.pid) {
        try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
      }
    }, timeout);

    proc.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += stderr;
        resolve({
          output: output + `\n[Timed out after ${timeout / 1000}s]`,
          exitCode: 1,
        });
        return;
      }

      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += stderr;

      resolve({ output, exitCode: code ?? 0 });
    });
  });
}

export const runCommandHandler: ToolHandler = async (input) => {
  const command = input.command;

  try {
    const { output, exitCode } = await runShell(command);

    if (!output.trim()) {
      return exitCode === 0
        ? 'Command executed successfully (no output).'
        : `Command failed with exit code ${exitCode} (no output).`;
    }

    if (exitCode !== 0) {
      return `${output}\n[Exit code: ${exitCode}]`;
    }

    return output;
  } catch (error) {
    if (error instanceof Error) {
      return `Error: ${error.message}`;
    }
    return 'Error: Unknown error executing command';
  }
};
