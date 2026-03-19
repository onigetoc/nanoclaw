import { useState, useEffect, useRef } from 'react';

type Encoder = { encode: (text: string) => number[] };

let encoderPromise: Promise<Encoder> | null = null;
let cachedEncoder: Encoder | null = null;

/** Lazily load the GPT-4o tokenizer (only fetched once, then cached). */
function getEncoder(): Promise<Encoder> {
  if (cachedEncoder) return Promise.resolve(cachedEncoder);
  if (!encoderPromise) {
    encoderPromise = import('js-tiktoken').then(mod => {
      cachedEncoder = mod.encodingForModel('gpt-4o');
      return cachedEncoder;
    });
  }
  return encoderPromise;
}

/**
 * Returns the GPT token count for the given text.
 * The tokenizer is loaded lazily on first use and debounced at 300ms.
 */
export function useTokenCount(text: string): number {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!text) { setCount(0); return; }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const enc = await getEncoder();
        setCount(enc.encode(text).length);
      } catch {
        setCount(0);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [text]);

  return count;
}
