import { run } from './app.js';

const args = process.argv.slice(2);
const providerIdx = args.indexOf('--provider');
const provider = (providerIdx !== -1 ? args[providerIdx + 1] : 'anthropic') as 'anthropic' | 'openai' | 'gemini';

if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'gemini') {
  console.error(`Unknown provider: "${provider}". Use "anthropic", "openai", or "gemini".`);
  process.exit(1);
}

run(provider);
