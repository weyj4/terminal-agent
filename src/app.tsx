import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { Agent } from './agent/index.js';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export function App() {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agent] = useState(() => {
    const a = new Agent();

    a.onAssistantText = (text) => {
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    };

    a.onToolUse = (name, input) => {
      console.log(`[Tool Use] ${name}:`, input);
    };

    a.onToolResult = (name, result) => {
      console.log(`[Tool Result] ${name}:`, result.substring(0, 100));
    };

    return a;
  })

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = input;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsProcessing(true);

    try {
      await agent.sendMessage(userMessage);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errMsg}`
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection='column' padding={1}>
      <Text bold color='cyan'>Terminal Agent (ctrl+c to quit)</Text>
      <Text dimColor>───────────────────────────</Text>

      {/* Message history */}
      <Box flexDirection='column' marginY={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={msg.role === 'user' ? 'blue' : 'yellow'} bold>
              {msg.role === 'user' ? 'You' : 'Claude'}:{' '}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}
      </Box>

      {/* Input area */}
      <Box>
        <Text color="blue" bold>You: </Text>
        {isProcessing ? (
          <Text dimColor>Processing...</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        )}
      </Box>
    </Box>
  );
}
