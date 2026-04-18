'use client';

import { useCallback, useState } from 'react';
import { requestJson } from './api-client';

type OcrTextResponse = {
  success: boolean;
  text: string;
  sourceLabels?: string[];
};

export function useOcrText() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');

  const extract = useCallback(async (image: string) => {
    try {
      setLoading(true);
      setError(null);
      const payload = await requestJson<OcrTextResponse>('/api/assets/ocr-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image }),
      });
      setText(payload.text);
      return payload;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'OCR に失敗しました。';
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    text,
    loading,
    error,
    extract,
  };
}
