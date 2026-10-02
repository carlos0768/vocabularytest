'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { bytesToBase64, passthroughEncodingFor, toLinear16 } from '@/lib/speech/recorded-audio';

/**
 * 単語をまとめて読み上げて追加するための録音。
 *
 * ボタンで録音を始め、もう一度押すと止めて書き起こしに回す。
 * 録音・送信の作りは音読チャレンジと同じで (MediaRecorder → GCP)、
 * iOS のPWAでも動く。違いは長さで、こちらは何十語も続けて話すぶん
 * 1回あたり最大 `VOICE_DICTATION_MAX_MS` まで録る。
 */

/**
 * 1回の録音の上限。GCPの同期認識が受け付けるのは1分までなので、
 * 余裕を残して自動で止める。止めた時点までの録音はそのまま使う。
 */
export const VOICE_DICTATION_MAX_MS = 55_000;

/**
 * iOS (生PCMに直して送る端末) の上限。16kHzの生PCMは1秒32KBあり、
 * これ以上はリクエストの上限に近づく。前後の無音は落としてから測る。
 */
const LINEAR16_MAX_SECONDS = 45;

/** 録音に使う MIME の候補。音読チャレンジと同じ並び。 */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export type VoiceDictationPhase = 'idle' | 'starting' | 'recording' | 'processing';

export interface VoiceDictationResult {
  words: string[];
  transcript: string;
}

function pickMimeType(): string | null {
  return CANDIDATE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

/** アクセストークンを明示的に載せる。iOSのPWAは Cookie が Safari と別になるため。 */
async function requestHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await createBrowserClient().auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch {
    // 取れなければ Cookie に任せる
  }
  return headers;
}

export function isVoiceDictationSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function useVoiceWordDictation(onResult: (result: VoiceDictationResult) => void) {
  const [phase, setPhase] = useState<VoiceDictationPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  // 取り消し・アンマウントのあとに届いた録音を捨てるための世代番号。
  const runRef = useRef(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    tickRef.current = null;
    autoStopRef.current = null;
  }, []);

  /** マイクを手放す。掴んだままだと端末の録音中表示が消えない。 */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob, mimeType: string, run: number) => {
    try {
      const passthrough = passthroughEncodingFor(mimeType);
      const converted = passthrough ? null : await toLinear16(blob, LINEAR16_MAX_SECONDS);
      if (!passthrough && !converted) {
        throw new Error(`この端末の録音形式を変換できませんでした (${mimeType || '形式不明'})`);
      }

      const audioBase64 = bytesToBase64(
        converted ? converted.pcm : new Uint8Array(await blob.arrayBuffer()),
      );
      const response = await fetch('/api/words/voice-input', {
        method: 'POST',
        headers: await requestHeaders(),
        body: JSON.stringify({
          audioBase64,
          encoding: passthrough ?? 'LINEAR16',
          ...(converted ? { sampleRateHertz: converted.sampleRateHertz } : {}),
        }),
      });
      const data = await response.json().catch(() => null) as
        | { success?: boolean; error?: string; words?: unknown; transcript?: unknown }
        | null;
      if (runRef.current !== run) return;

      if (!response.ok || !data?.success) {
        throw new Error(
          typeof data?.error === 'string' && data.error
            ? data.error
            : `音声認識に失敗しました (HTTP ${response.status})`,
        );
      }

      const words = Array.isArray(data.words)
        ? data.words.filter((word): word is string => typeof word === 'string')
        : [];
      setPhase('idle');
      onResultRef.current({
        words,
        transcript: typeof data.transcript === 'string' ? data.transcript : '',
      });
    } catch (transcribeError) {
      if (runRef.current !== run) return;
      setPhase('idle');
      setError(transcribeError instanceof Error ? transcribeError.message : '音声認識に失敗しました');
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    clearTimers();
    setPhase('processing');
    recorder.stop();
  }, [clearTimers]);

  const start = useCallback(async () => {
    if (phase !== 'idle') return;
    setError(null);

    if (!isVoiceDictationSupported()) {
      setError('この端末・ブラウザは録音に対応していません');
      return;
    }

    const run = runRef.current + 1;
    runRef.current = run;
    setPhase('starting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (runRef.current !== run) return;
      setPhase('idle');
      setError('マイクを使えませんでした。端末の設定でマイクを許可してください');
      return;
    }
    if (runRef.current !== run) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      releaseStream();
      setPhase('idle');
      setError('録音を開始できませんでした');
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      releaseStream();
      recorderRef.current = null;
      if (runRef.current !== run) return;

      // 要求した型ではなく、実際に録れた型で判断する (Safari は webm と答えて mp4 を出す)。
      const recordedMimeType = recorder.mimeType || mimeType || '';
      const blob = new Blob(chunksRef.current, { type: recordedMimeType });
      if (blob.size === 0) {
        setPhase('idle');
        setError('録音できませんでした。もう一度お試しください');
        return;
      }
      void transcribe(blob, recordedMimeType, run);
    };

    recorderRef.current = recorder;
    recorder.start();

    const startedAt = Date.now();
    setElapsedMs(0);
    setPhase('recording');
    tickRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    autoStopRef.current = window.setTimeout(stop, VOICE_DICTATION_MAX_MS);
  }, [phase, releaseStream, stop, transcribe]);

  /** 録音・認識を取りやめる。届いた結果は捨てる。 */
  const cancel = useCallback(() => {
    runRef.current += 1;
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
    releaseStream();
    setPhase('idle');
    setElapsedMs(0);
  }, [clearTimers, releaseStream]);

  useEffect(() => cancel, [cancel]);

  return { phase, elapsedMs, error, start, stop, cancel, clearError: () => setError(null) };
}
