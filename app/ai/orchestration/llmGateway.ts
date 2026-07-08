import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 4096;

export async function complete(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await client.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: params.system,
    messages: params.messages,
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }
  return block.text;
}

export async function stream(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  model?: string;
  maxTokens?: number;
  onChunk: (text: string) => void;
  onDone?: () => void;
}): Promise<string> {
  let fullText = '';

  const streamResponse = client.messages.stream({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: params.system,
    messages: params.messages,
  });

  streamResponse.on('text', (text) => {
    fullText += text;
    params.onChunk(text);
  });

  await streamResponse.finalMessage();

  if (params.onDone) {
    params.onDone();
  }

  return fullText;
}

export async function structured<T>(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  schema: Record<string, unknown>;
  schemaName: string;
  model?: string;
}): Promise<T> {
  const response = await client.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: params.system,
    messages: params.messages,
    tools: [
      {
        name: params.schemaName,
        description: `Return structured data matching the ${params.schemaName} schema`,
        input_schema: params.schema as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: params.schemaName },
  });

  const block = response.content[0];
  if (!block || block.type !== 'tool_use') {
    throw new Error('Expected tool_use response from Claude API');
  }

  return block.input as T;
}
