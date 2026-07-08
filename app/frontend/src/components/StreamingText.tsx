import { useEffect, useRef, useState } from 'react';
import { fetchSSEPost } from '../lib/api';
import { LoadingSpinner } from './LoadingSpinner';

interface StreamingTextProps {
  path: string;
  body: Record<string, unknown>;
  onComplete?: (text: string) => void;
  className?: string;
}

export function StreamingText({ path, body, onComplete, className = '' }: StreamingTextProps) {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fullTextRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setText('');
    fullTextRef.current = '';
    setIsStreaming(true);
    setError(null);

    fetchSSEPost(path, body, {
      onMessage: (data) => {
        if (cancelled) return;
        fullTextRef.current += data;
        setText(fullTextRef.current);
      },
      onDone: () => {
        if (cancelled) return;
        setIsStreaming(false);
        onComplete?.(fullTextRef.current);
      },
      onError: () => {
        if (cancelled) return;
        setError('Failed to stream response. Please try again.');
        setIsStreaming(false);
      },
    }).catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsStreaming(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(body)]);

  if (error) {
    return (
      <div className="rounded-lg p-4 text-sm" style={{ background: 'rgba(255,45,139,0.08)', border: '1px solid rgba(255,45,139,0.2)', color: '#ff2d8b' }}>
        {error}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'rgba(226,232,240,0.85)' }}>
        {text}
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-0.5 animate-blink align-middle" style={{ background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }} />
        )}
      </div>
      {isStreaming && text === '' && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(0,212,255,0.7)' }}>
          <LoadingSpinner size="sm" />
          <span>Generating…</span>
        </div>
      )}
    </div>
  );
}
