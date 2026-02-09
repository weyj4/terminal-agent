import Anthropic from '@anthropic-ai/sdk';
import { toolSpecs, getToolHandler } from '../tools/index.js';
import { systemPrompt } from '../prompts/index.js'

type Message = Anthropic.MessageParam;

export class Agent {
  private client: Anthropic;
  private conversation: Message[];
  private systemPrompt: string;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
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

  private async runInference() {
    return await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
    });
  }

  onAssistantText?: (text: string) => void;
  onToolUse?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: string) => void;
}
