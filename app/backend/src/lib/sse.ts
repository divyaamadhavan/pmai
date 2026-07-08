import { Response } from 'express';

export interface SSEStream {
  write: (data: string) => void;
  writeEvent: (event: string, data: unknown) => void;
  error: (message: string, code?: string) => void;
  end: () => void;
}

/**
 * Initialise SSE headers on the response and return a helper for writing events.
 * The caller is responsible for calling stream.end() when done.
 */
export function createSSEStream(res: Response): SSEStream {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Heartbeat every 20 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 20_000);

  res.on('close', () => clearInterval(heartbeat));

  return {
    /** Write a plain text chunk (matches OpenAI-style streaming). */
    write(data: string): void {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: data })}\n\n`);
      }
    },

    /** Write a named event with arbitrary JSON payload. */
    writeEvent(event: string, data: unknown): void {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },

    /** Write an error event then close. */
    error(message: string, code = 'STREAM_ERROR'): void {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message, code })}\n\n`);
        clearInterval(heartbeat);
        res.end();
      }
    },

    /** Send the terminal [DONE] sentinel and close the stream. */
    end(): void {
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        clearInterval(heartbeat);
        res.end();
      }
    },
  };
}
