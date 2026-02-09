import { render } from "ink";
import { App } from "./app.js";

const args = process.argv.slice(2);
const providerIdx = args.indexOf('--provider');
const provider = (providerIdx !== -1 ? args[providerIdx + 1] : 'anthropic') as 'anthropic' | 'openai';

if (provider !== 'anthropic' && provider !== 'openai') {
  console.error(`Unknown provider: "${provider}". Use "anthropic" or "openai".`);
  process.exit(1);
}

render(<App provider={provider} />);
