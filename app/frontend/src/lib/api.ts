import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('pmai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('pmai_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface SSEOptions {
  onMessage: (data: string) => void;
  onError?: (error: Event | Error) => void;
  onDone?: () => void;
  /** Called for named SSE events (event: <name>\ndata: <json>) */
  onEvent?: (eventName: string, data: string) => void;
}

export function createSSEStream(url: string, options: SSEOptions): EventSource {
  const token = localStorage.getItem('pmai_token');
  const fullUrl = token
    ? `${API_BASE}${url}?token=${encodeURIComponent(token)}`
    : `${API_BASE}${url}`;

  const es = new EventSource(fullUrl);

  es.onmessage = (event) => {
    if (event.data === '[DONE]') { options.onDone?.(); es.close(); return; }
    options.onMessage(event.data);
  };

  es.onerror = (event) => { options.onError?.(event); es.close(); };

  return es;
}

export async function fetchSSEPost(
  path: string,
  body: Record<string, unknown>,
  options: SSEOptions
): Promise<void> {
  const token = localStorage.getItem('pmai_token');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return;

  let buffer = '';

  const processBuffer = () => {
    // SSE messages are separated by blank lines
    const blocks = buffer.split(/\n\n/);
    // Last block may be incomplete — keep it
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      let eventName = 'message';
      let dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataLines.push(line.slice(6));
        }
      }

      const rawData = dataLines.join('\n');
      if (!rawData) continue;

      if (eventName === 'error') {
        options.onError?.(new Event('error'));
        options.onEvent?.('error', rawData);
        continue;
      }

      if (eventName !== 'message') {
        // Named event — pass to onEvent, also fire onDone for 'done'
        options.onEvent?.(eventName, rawData);
        if (eventName === 'done') options.onDone?.();
        continue;
      }

      // Default 'message' event — parse text chunks
      if (rawData === '[DONE]') { options.onDone?.(); return; }
      try {
        const parsed = JSON.parse(rawData) as Record<string, unknown>;
        if (typeof parsed.text === 'string') {
          options.onMessage(parsed.text);
        } else if (parsed.message) {
          options.onError?.(new Event('error'));
        } else {
          options.onMessage(rawData);
        }
      } catch {
        options.onMessage(rawData);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) { processBuffer(); options.onDone?.(); break; }
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
}
