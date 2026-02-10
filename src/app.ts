import { TUI, Text, Markdown, Editor, Loader, Container, Spacer, ProcessTerminal } from '@mariozechner/pi-tui';
import type { Component, MarkdownTheme, EditorTheme } from '@mariozechner/pi-tui';
import chalk from 'chalk';
import { Agent as ClaudeAgent } from './agent/claude-agent.js';
import { Agent as OpenAIAgent } from './agent/openai-agent.js';

type Provider = 'anthropic' | 'openai';

function createAgent(provider: Provider) {
  return provider === 'openai' ? new OpenAIAgent() : new ClaudeAgent();
}

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

  const header = new Text(
    chalk.bold.cyan('Terminal Agent') + chalk.dim(` (ctrl+c to quit)`),
    1, 0
  );

  const chatContainer = new Container();
  const statusContainer = new Container();

  const editor = new Editor(tui, editorTheme);

  tui.addChild(header);
  tui.addChild(new Spacer(1));
  tui.addChild(chatContainer);
  tui.addChild(statusContainer);
  tui.addChild(editor as Component);

  tui.setFocus(editor as Component);

  const agent = createAgent(provider);
  let isProcessing = false;
  let loader: Loader | null = null;

  function addUserMessage(text: string) {
    chatContainer.addChild(
      new Text(chalk.blue.bold('You: ') + text, 1, 0)
    );
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

  process.on('SIGINT', () => {
    tui.stop();
    process.exit(0);
  });

  process.stdin.on('data', (data: Buffer) => {
    if (data[0] === 0x03) {
      tui.stop();
      process.exit(0);
    }
  });

  tui.start();
}
