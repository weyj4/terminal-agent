import Anthropic from '@anthropic-ai/sdk';
import { toolSpecs, getToolHandler } from './claude-tools.js';
import { systemPrompt } from '../prompts/index.js'

type Message = Anthropic.MessageParam;
type InferenceFn = () => Promise<Anthropic.Message>;

export class Agent {
  private client?: Anthropic;
  private conversation: Message[];
  private systemPrompt: string;
  private inferenceFn?: InferenceFn;

  constructor(options?: { apiKey?: string; runInference?: InferenceFn }) {
    if (options?.runInference) {
      this.inferenceFn = options.runInference;
    } else {
      this.client = new Anthropic({ apiKey: options?.apiKey });
    }
    this.conversation = [];
    this.systemPrompt = systemPrompt;
  }

  async sendMessage(userInput: string): Promise<void> {
    this.conversation.push({
      role: 'user',
      content: userInput
    });

    while (true) {
      const message = await this.runInference();

      this.onUsage?.(message.usage.input_tokens, message.usage.output_tokens);

      this.conversation.push({
        role: 'assistant',
        content: message.content
      });

      const toolUses: Anthropic.ToolUseBlock[] = [];

      for (const block of message.content) {
        if (block.type === 'text') {
          this.onAssistantText?.(block.text);
        } else if (block.type === 'tool_use') {
          toolUses.push(block);
        }
      }

      if (toolUses.length === 0) {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        this.onToolUse?.(toolUse.name, toolUse.input);

        const handler = getToolHandler(toolUse.name);

        if (!handler) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: Unknown tool: '${toolUse.name}'`
          });
          continue;
        }

        const result = await handler(toolUse.input as Record<string, string>);
        this.onToolResult?.(toolUse.name, result);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        });
      }

      this.conversation.push({
        role: 'user',
        content: toolResults
      });
    }
  }

  private async runInference(): Promise<Anthropic.Message> {
    if (this.inferenceFn) {
      return await this.inferenceFn();
    }

    const stream = this.client!.messages.stream({
      model: 'claude-opus-4-6-20250527',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: this.systemPrompt,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: this.conversation,
      tools: toolSpecs
    }).on('text', (delta) => {
      this.onAssistantTextDelta?.(delta);
    });

    return await stream.finalMessage();
  }

  onAssistantText?: (text: string) => void;
  onAssistantTextDelta?: (delta: string) => void;
  onToolUse?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
}
