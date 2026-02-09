import type Anthropic from "@anthropic-ai/sdk";

export type ToolHandler = (
	input: Record<string, string>,
) => Promise<string> | string;

export type ToolDefinition = {
	spec: Anthropic.Messages.Tool;
	handler: ToolHandler;
};
