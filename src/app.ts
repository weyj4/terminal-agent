import { TUI, Text, Markdown, Editor, Loader, Container, Spacer, ProcessTerminal, visibleWidth, matchesKey } from '@mariozechner/pi-tui';
import type { Component, MarkdownTheme, EditorTheme } from '@mariozechner/pi-tui';
import { homedir } from 'os';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { Agent as ClaudeAgent } from './agent/claude-agent.js';
import { Agent as OpenAIAgent } from './agent/openai-agent.js';

type Provider = 'anthropic' | 'openai';

function createAgent(provider: Provider) {
  return provider === 'openai' ? new OpenAIAgent() : new ClaudeAgent();
}

function getPathInfo(): string {
  const home = homedir();
  const cwd = process.cwd();
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return `${displayPath} (${branch})`;
  } catch {
    return displayPath;
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

const COST_PER_INPUT_TOKEN: Record<Provider, number> = {
  anthropic: 3 / 1_000_000,
  openai: 0.15 / 1_000_000,
};

const COST_PER_OUTPUT_TOKEN: Record<Provider, number> = {
  anthropic: 15 / 1_000_000,
  openai: 0.6 / 1_000_000,
};

const markdownTheme: MarkdownTheme = {
  heading: (text) => chalk.bold.cyan(text),
  link: (text) => chalk.underline.blue(text),
  linkUrl: (text) => chalk.dim(text),
  code: (text) => chalk.bgGray.white(text),
  codeBlock: (text) => chalk.white(text),
  codeBlockBorder: (text) => chalk.dim(text),
  quote: (text) => chalk.italic.dim(text),
  quoteBorder: (text) => chalk.dim(text),
  hr: (text) => chalk.dim(text),
  listBullet: (text) => chalk.cyan(text),
  bold: (text) => chalk.bold(text),
  italic: (text) => chalk.italic(text),
  strikethrough: (text) => chalk.strikethrough(text),
  underline: (text) => chalk.underline(text),
};

const editorTheme: EditorTheme = {
  borderColor: (str) => chalk.blue(str),
  selectList: {
    selectedPrefix: (text) => chalk.cyan(text),
    selectedText: (text) => chalk.bold(text),
    description: (text) => chalk.dim(text),
    scrollInfo: (text) => chalk.dim(text),
    noMatch: (text) => chalk.dim(text),
  },
};

export function run(provider: Provider = 'anthropic') {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const pathInfo = getPathInfo();
  const header = new Text(
    chalk.bold.cyan('Terminal Agent') + chalk.dim(` (ctrl+c to quit)`),
    1, 0
  );
  const statusBar = new Text('', 1, 0);
  const footerBar = new Text('', 1, 0);

  const chatContainer = new Container();
  const statusContainer = new Container();

  const editor = new Editor(tui, editorTheme);

  tui.addChild(header);
  tui.addChild(new Spacer(1));
  tui.addChild(chatContainer);
  tui.addChild(statusContainer);
  tui.addChild(statusBar);
  tui.addChild(editor as Component);
  tui.addChild(footerBar);

  tui.setFocus(editor as Component);

  const agent = createAgent(provider);
  let isProcessing = false;
  let loader: Loader | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  function updateStatusBar() {
    const total = totalInputTokens + totalOutputTokens;
    if (total === 0) {
      statusBar.setText(' ');
      return;
    }
    const cost = totalInputTokens * COST_PER_INPUT_TOKEN[provider] + totalOutputTokens * COST_PER_OUTPUT_TOKEN[provider];
    statusBar.setText(chalk.dim(`${formatTokens(total)} tokens · $${cost.toFixed(2)}`));
    tui.requestRender();
  }

  function updateFooter() {
    const styledInfo = chalk.dim(pathInfo);
    const infoWidth = visibleWidth(styledInfo);
    const termWidth = terminal.columns;
    const padding = Math.max(0, termWidth - infoWidth - 2);
    footerBar.setText(' '.repeat(padding) + styledInfo);
    tui.requestRender();
  }

  updateStatusBar();
  updateFooter();

  function addUserMessage(text: string) {
    const lines = text.split('\n');
    const quoted = lines.map(line => chalk.green('│ ') + line).join('\n');
    chatContainer.addChild(new Text(quoted, 1, 0));
    chatContainer.addChild(new Spacer(1));
    tui.requestRender();
  }

  function addAssistantMessage(text: string) {
    chatContainer.addChild(
      new Text(chalk.yellow.bold('Assistant: '), 1, 0)
    );
    chatContainer.addChild(new Markdown(text.trim(), 1, 0, markdownTheme));
    chatContainer.addChild(new Spacer(1));
    tui.requestRender();
  }

  function addToolInfo(name: string, detail: string) {
    chatContainer.addChild(
      new Text(chalk.dim(`  [${name}] ${detail}`), 1, 0)
    );
    tui.requestRender();
  }

  function showLoader() {
    statusContainer.clear();
    loader = new Loader(
      tui,
      (spinner) => chalk.cyan(spinner),
      (text) => chalk.dim(text),
      'Thinking...'
    );
    statusContainer.addChild(loader);
    tui.requestRender();
  }

  function hideLoader() {
    if (loader) {
      loader.stop();
      loader = null;
    }
    statusContainer.clear();
    tui.requestRender();
  }

  agent.onAssistantText = (text) => {
    hideLoader();
    addAssistantMessage(text);
  };

  agent.onToolUse = (name, input) => {
    const summary = typeof input === 'object' ? JSON.stringify(input).substring(0, 80) : String(input);
    addToolInfo(name, summary);
  };

  agent.onToolResult = (name, result) => {
    addToolInfo(name, `→ ${result.substring(0, 80)}`);
  };

  agent.onUsage = (inputTokens, outputTokens) => {
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    updateStatusBar();
  };

  editor.onSubmit = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    editor.setText('');
    addUserMessage(text);
    isProcessing = true;
    showLoader();

    try {
      await agent.sendMessage(text);
    } catch (error) {
      hideLoader();
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      chatContainer.addChild(
        new Text(chalk.red(`Error: ${errMsg}`), 1, 0)
      );
      chatContainer.addChild(new Spacer(1));
      tui.requestRender();
    } finally {
      hideLoader();
      isProcessing = false;
    }
  };

  const originalHandleInput = editor.handleInput.bind(editor);
  editor.handleInput = (data: string) => {
    if (matchesKey(data, 'ctrl+c')) {
      tui.stop();
      process.exit(0);
    }
    originalHandleInput(data);
  };

  tui.start();
}
