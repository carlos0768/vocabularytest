'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modal';
import { QuizModeChooser } from '@/components/quiz';
import { readQuizMode, writeQuizMode, type QuizMode } from '@/lib/quiz/quiz-mode-preference';
import { voiceQuizBatch } from '@/lib/quiz/voice-quiz-batch';
import { getRepository } from '@/lib/db';
import { cn, recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview, getStatusAfterAnswer, sortWordsByPriority } from '@/lib/spaced-repetition';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { stopSpeaking } from '@/lib/speech';
import {
  prefetchVoiceQuizAudio,
  primeVoiceQuizAudio,
  speakVoiceQuiz,
  stopVoiceQuizAudio,
} from '@/lib/quiz/voice-quiz-speech';
import { bytesToBase64, passthroughEncodingFor, toLinear16 } from '@/lib/speech/recorded-audio';
import { VOICE_QUIZ_RESULT_ANNOUNCEMENTS, type VoiceQuizResultKey } from '@/lib/quiz/voice-quiz-audio';
import {
  buildVoiceQuizAnswerAnnouncement,
  buildVoiceQuizPromptFor,
  canRetryVoiceQuiz,
  DEFAULT_VOICE_QUIZ_DIRECTION,
  recognitionLanguageFor,
  type VoiceQuizDirection,
  type VoiceQuizPromptSegment,
  DEFAULT_VOICE_QUIZ_ATTEMPTS,
  DEFAULT_VOICE_QUIZ_DURATION_SEC,
  MAX_VOICE_QUIZ_DURATION_SEC,
  MIN_VOICE_QUIZ_DURATION_SEC,
  normalizeVoiceQuizAttempts,
  normalizeVoiceQuizDuration,
  VOICE_QUIZ_DURATION_OPTIONS,
  pickVoiceQuizRetryPrompt,
  randomVoiceQuizPromptOffset,
  resolveVoiceQuizCount,
  VOICE_QUIZ_ATTEMPT_OPTIONS,
} from '@/lib/quiz/voice-quiz-prompt';
import {
  combineWordMeanings,
  isAnyEnglishAnswerCorrect,
  isAnyJapaneseAnswerCorrect,
  japaneseAnswerHints,
} from '@/lib/quiz/voice-quiz-answer';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase';
import type { Word, SubscriptionStatus } from '@/types';

const TIMER_TICK_MS = 50;

/**
 * 「次へ」を押さなくても自動で次の問題へ進むまでの待ち時間。
 * 正解のときはテンポを優先してすぐ進む。読み上げも挟まない。
 * 不正解のときは「正解は〜です」を聞き終えられるだけの間を取る。
 */
/**
 * 音声認識が続けて落ちたら、そこでセッションを止める回数。
 * 1回や2回は通信の揺れで起きるので流すが、それ以上は設定か上限の問題で、
 * 残りの問題を出しても同じように落ちるだけ。
 */
const MAX_CONSECUTIVE_RECOGNITION_ERRORS = 3;

const AUTO_ADVANCE_CORRECT_MS = 1000;
const AUTO_ADVANCE_INCORRECT_MS = 4200;

/* --- Merken Design System (Solid) のトークン --- */
/** 面を持つ要素の枠。ハードシャドウは大きさに応じて2種類使い分ける。 */
const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-ink)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-ink)]';
/** 見出しの上に置く小さなラベル。 */
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

/**
 * 録音に使う MIME の候補。opus で録れれば圧縮済みのまま送れる。
 * どれも通らない端末 (iOS Safari) では、ブラウザの既定で録って
 * LINEAR16 に変換してから送る —— ここで諦めると音読自体ができない。
 */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

/**
 * 録音の設定。`mimeType` が null なら MediaRecorder に何も渡さず、
 * ブラウザの既定で録る。「指定なし」と「録音できない」を空文字で表すと、
 * falsy 判定に引っかかって録音そのものが素通りされる。
 */
type RecordingSetup = { mimeType: string | null };

/**
 * 録音に使う MIME を選ぶ。エンコーディングは録音後の実際の出力から決める。
 * null は「この端末では録音できない」。
 */
function pickRecordingSetup(): RecordingSetup | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const supported = CANDIDATE_MIME_TYPES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
  return { mimeType: supported ?? null };
}

/**
 * 認識APIに付ける見出し。
 *
 * このアプリの他の認証付きAPIと同じく、アクセストークンを明示的に載せる。
 * Cookie だけに頼ると、ホーム画面に追加した iOS の PWA が Safari とは別の
 * 保存領域を持つために、ログイン済みでも 401 で弾かれることがある ——
 * 端末側の音声認識が「なぜかスマホだけ失敗する」形で出る。
 */
async function recognizeRequestHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await createBrowserClient().auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch {
    // 取れなければ Cookie に任せる。ここで諦めると出題そのものが止まる。
  }
  return headers;
}

/**
 * 認識APIが表記の食い違いを見つけたときだけ返してくる、表記→読みの対応表。
 * 「恩赦」を「御社」と書かれても、読みが同じなら正解として拾うために使う。
 */
function readingsFromResponse(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const readings: Record<string, string> = {};
  for (const [text, reading] of Object.entries(value as Record<string, unknown>)) {
    if (typeof reading === 'string' && reading) readings[text] = reading;
  }

  return Object.keys(readings).length > 0 ? readings : undefined;
}

type Phase = 'narrating' | 'listening' | 'grading' | 'retrying' | 'answered';
type SetupState = 'checking' | 'ready' | 'unsupported' | 'mic-denied';

export default function VoiceQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const returnPath = searchParams.get('from');
  // 通常クイズから引き継いだ出題数。モード選択はURLだけで表現し、保存はしない。
  const requestedCount = resolveVoiceQuizCount(searchParams.get('count'));
  const { subscription, loading: authLoading, user } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const backToProject = useCallback(() => {
    router.replace(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

  /** 通常クイズへ戻す。出題数はそのまま引き継ぐ。 */
  const goToNormalQuiz = useCallback(() => {
    writeQuizMode('normal');
    const params = new URLSearchParams({ count: String(requestedCount) });
    if (returnPath) params.set('from', returnPath);
    router.replace(`/quiz/${projectId}?${params.toString()}`);
  }, [router, projectId, returnPath, requestedCount]);

  // 端末の選択を読む。未選択ならクイズの前に選択画面を出す。
  useEffect(() => {
    setStoredMode(readQuizMode());
    setModeLoaded(true);
  }, []);


  /** 形式を選んだ。音読ならこの画面のまま、四択なら通常クイズへ移る。 */
  const chooseMode = useCallback(
    (mode: QuizMode) => {
      writeQuizMode(mode);
      setStoredMode(mode);
      setShowModeSwitch(false);
      if (mode === 'normal') goToNormalQuiz();
    },
    [goToNormalQuiz],
  );

  /**
   * 単語帳の出題候補を、優先度順に並べたもの。1回のセッションで解くのは
   * この先頭から `requestedCount` 問ぶんで、終わったら次のひと組へ進む。
   * 並びは読み込み時に一度だけ決める —— 解くたびに並べ替えると、
   * 「次の10問」がどこから続くのか追えなくなる。
   */
  const [pool, setPool] = useState<Word[]>([]);
  /** いま解いているひと組が、並びの何番目から始まるか。 */
  const [batchStart, setBatchStart] = useState(0);
  /**
   * いま解いているひと組と、その次の見通し。
   * 画面の進捗も出題も、この範囲だけを見る。
   */
  const { words, nextStart, nextSize: nextBatchSize } = useMemo(
    () => voiceQuizBatch(pool, batchStart, requestedCount),
    [pool, batchStart, requestedCount],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState({ correct: 0, total: 0, disqualified: 0 });
  const [prepareError, setPrepareError] = useState(false);

  const [attemptsAllowed, setAttemptsAllowed] = useState(DEFAULT_VOICE_QUIZ_ATTEMPTS);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [retryMessage, setRetryMessage] = useState('');
  /** 1回の解答に使える秒数。開始画面で選ぶ。 */
  const [durationSec, setDurationSec] = useState(DEFAULT_VOICE_QUIZ_DURATION_SEC);
  const durationMs = durationSec * 1000;
  /**
   * 自由入力の欄の中身。数値ではなく文字列で持つ ——
   * 消して打ち直す途中の空文字や "1" を、その都度3秒へ丸めてしまわないため。
   */
  const [customDurationText, setCustomDurationText] = useState('');
  const isCustomDuration = customDurationText.trim() !== '';

  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [phase, setPhase] = useState<Phase>('narrating');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_VOICE_QUIZ_DURATION_SEC * 1000);
  const [recognizedText, setRecognizedText] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [recognitionErrored, setRecognitionErrored] = useState(false);
  /**
   * 認識が落ちた理由。サーバーは「上限に達した」「認証が必要」などを
   * 書き分けて返しているのに、ここで捨てて「失敗しました」とだけ出していた。
   * 全問落ちても原因が分からないので、返ってきた文言をそのまま見せる。
   */
  const [recognitionErrorMessage, setRecognitionErrorMessage] = useState('');
  /**
   * 続けても必ず落ちる失敗 (利用上限・設定不足)。1問ごとに黙って不正解に
   * するのではなく、ここで止めて理由を出す。
   */
  const [blockedMessage, setBlockedMessage] = useState('');
  /** 出題の向き。開始画面で選ぶ。 */
  const [direction, setDirection] = useState<VoiceQuizDirection>(DEFAULT_VOICE_QUIZ_DIRECTION);
  /** 答えるのが日本語か (英→日)。画面の文言と主従はこれで決まる。 */
  const askingForJapanese = direction === 'en-to-ja';
  /** 「わからない」で答えを見た問題か。失格とは区別して表示する。 */
  const [gaveUp, setGaveUp] = useState(false);
  /** 中断の確認を出しているか。出している間はクイズを止める。 */
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  /**
   * この端末で選ばれているクイズ形式。null = 未選択なので、解き始める前に選ばせる。
   * localStorage はサーバーには無いので、マウント後に読む。
   */
  const [storedMode, setStoredMode] = useState<QuizMode | null>(null);
  const [modeLoaded, setModeLoaded] = useState(false);
  /** 右上から開くクイズ形式の切り替え。 */
  const [showModeSwitch, setShowModeSwitch] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<RecordingSetup | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerStartRef = useRef<number | null>(null);
  /** この試行の判定が済んだか。1問の中で複数回試行するので試行ごとにリセットする。 */
  const attemptSettledRef = useRef(false);
  const attemptRef = useRef(1);
  const attemptsAllowedRef = useRef(DEFAULT_VOICE_QUIZ_ATTEMPTS);
  /**
   * 解答時間のミリ秒。カウントダウンや録音開始はレンダー外から読むので、
   * 出題中に値が変わらない ref を唯一の参照元にする。
   */
  const durationMsRef = useRef(DEFAULT_VOICE_QUIZ_DURATION_SEC * 1000);
  /** 出題中に向きが変わらないよう、出題〜採点はこの ref を参照する。 */
  const directionRef = useRef<VoiceQuizDirection>(DEFAULT_VOICE_QUIZ_DIRECTION);
  const questionRunRef = useRef(0);
  /**
   * 続けて落ちた音声認識の回数。キーが失効しているときのように、
   * 何度やっても落ちる状態で残りの問題を機械的に潰させないための歯止め。
   */
  const consecutiveRecognitionErrorsRef = useRef(0);
  /**
   * いま出題中の単語。`setCurrentIndex` の反映は次のレンダーまで待たされるので、
   * 「次へ」の直後に startQuestion を呼ぶとレンダー由来の値はまだ1問前を指す。
   * 出題〜採点の一連の処理はこの ref を唯一の参照元にする。
   */
  const activeWordRef = useRef<Word | null>(null);
  // セッションごとに開始テンプレートをずらし、毎回同じ言い回しで始まらないようにする。
  const promptOffsetRef = useRef(randomVoiceQuizPromptOffset());
  // startListening と handleAttemptResult は相互に呼び合うので ref 経由で解決する。
  const startListeningRef = useRef<(run: number) => void>(() => {});

  const currentWord = words[currentIndex] ?? null;

  /**
   * この端末が四択を選んでいるなら、音読を開いても四択へ送る。
   * 通常クイズ側と対になる処理。goToNormalQuiz は replace なので堂々巡りにならない。
   *
   * この効果は state の宣言より後ろに置くこと —— 依存配列はレンダー中に評価されるので、
   * 宣言前に書くと modeLoaded が TDZ に入って落ちる。
   */
  const redirectedToNormalRef = useRef(false);
  useEffect(() => {
    if (!modeLoaded || storedMode !== 'normal' || redirectedToNormalRef.current) return;
    redirectedToNormalRef.current = true;
    goToNormalQuiz();
  }, [modeLoaded, storedMode, goToNormalQuiz]);

  // 固定文の音声を先に取ってきておく。設定を選んでいる間に済むので、
  // 1問目の読み上げがネットワーク待ちで遅れない。
  useEffect(() => {
    prefetchVoiceQuizAudio();
  }, []);

  // マイク権限 + MediaRecorder対応を一度だけ確認する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const setup = pickRecordingSetup();
      if (!setup || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setSetupState('unsupported');
        return;
      }
      recordingRef.current = setup;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setSetupState('ready');
      } catch {
        if (!cancelled) setSetupState('mic-denied');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // 単語の読み込み。出題文はテンプレートから組み立てるので事前準備は不要。
  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
        const ownerUserId = user ? user.id : getGuestUserId();
        // 音読チャレンジは単語帳1冊ぶんしか出題できない。横断出題の入口
        // (/voice-quiz/all や復習・今日の学習) を踏んだら、行き止まりにせず
        // 四択へ渡す。ここで backToProject に落とすと、クイズが始まらないまま
        // ホームへ戻されたように見える。
        if (projectId === 'all') {
          goToNormalQuiz();
          return;
        }

        const project = await repository.getProject(projectId);
        if (!project || project.userId !== ownerUserId) {
          backToProject();
          return;
        }

        let loaded = await repository.getWords(projectId);
        const unmastered = loaded.filter((w) => w.status !== 'mastered');
        if (unmastered.length > 0) {
          loaded = unmastered;
        }

        if (loaded.length === 0) {
          backToProject();
          return;
        }

        setPool(sortWordsByPriority(loaded));
        setBatchStart(0);
      } catch {
        setPrepareError(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, projectId, repository, user, backToProject, goToNormalQuiz]);

  /** 1問を確定させる。以降この問題では再挑戦しない。 */
  const finishQuestion = useCallback(
    async (transcript: string, correct: boolean, apiErrored: boolean, skipped = false) => {
      const word = activeWordRef.current;
      if (!word) return;
      timerStartRef.current = null;

      // 「わからない」は自分から答えを見に行った操作なので、時間切れの失格とは分ける。
      const disqualified = !skipped && !transcript;

      playAnswerFeedbackSound(correct);
      setRecognizedText(transcript);
      setIsCorrect(correct);
      setIsDisqualified(disqualified);
      setGaveUp(skipped);
      setRecognitionErrored(apiErrored);
      setPhase('answered');

      setResults((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        disqualified: prev.disqualified + (disqualified ? 1 : 0),
      }));

      // 音声認識が落ちたぶんは、間違えたことにしない。答えを聞き取れなかった
      // だけで、答えられなかったわけではない —— 記録すると復習の間隔まで
      // 縮み、上限に達した日は解いた10問ぶんの成績と学習状態が丸ごと壊れる。
      if (!apiErrored) {
        if (correct) {
          recordCorrectAnswer(false);
        } else {
          recordWrongAnswer(word.id, word.english, word.japanese, projectId, word.distractors);
        }
        recordActivity();
      }

      // 判定を声でも伝える。外したときは続けて正解を読み上げる。
      // 正解のときは短い一言だけ —— すぐ次の問題へ進むので、長く喋る間が無い。
      // 「わからない」は自分から答えを見に行った操作なので、判定は読み上げず
      // すぐ正解へ移る。正解/不正解/時間切れだけ一言添える。
      const resultKey: VoiceQuizResultKey | null = correct
        ? 'correct'
        : skipped
        ? null
        : disqualified
        ? 'disqualified'
        : 'incorrect';

      const announcement: VoiceQuizPromptSegment[] = [
        ...(resultKey ? [{ text: VOICE_QUIZ_RESULT_ANNOUNCEMENTS[resultKey], lang: 'ja' as const }] : []),
        ...(correct ? [] : buildVoiceQuizAnswerAnnouncement(directionRef.current, word)),
      ];

      const announcementRun = questionRunRef.current;
      void (async () => {
        for (const segment of announcement) {
          // 次の問題へ進んだあとに前の答えが流れ続けないよう、毎回確かめる。
          if (questionRunRef.current !== announcementRun) return;
          await speakVoiceQuiz(segment.text, segment.lang, { variable: segment.variable });
        }
      })();

      if (apiErrored) return;

      try {
        const newStatus = getStatusAfterAnswer(word.status, correct);
        const srUpdate = calculateNextReview(correct, word);
        const updates = { status: newStatus, ...srUpdate };
        const becameMastered = word.status !== 'mastered' && newStatus === 'mastered';
        await repository.updateWord(word.id, updates);
        setPool((prev) => prev.map((w) => (w.id === word.id ? { ...w, ...updates } : w)));
        if (user) {
          fetch('/api/quiz-sessions/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wordId: word.id,
              projectId,
              english: word.english,
              japanese: word.japanese,
              becameMastered,
              isCorrect: correct,
            }),
          }).catch((error) => {
            console.warn('Failed to record quiz session event:', error);
          });
        }
      } catch {}
    },
    [projectId, repository, user],
  );

  /** 1回の試行の結果を受けて、再挑戦させるか問題を確定するかを決める。 */
  const handleAttemptResult = useCallback(
    async (
      transcript: string,
      apiErrored: boolean,
      run: number,
      alternatives: string[] = [],
      readings?: Record<string, string>,
    ) => {
      if (attemptSettledRef.current) return;
      attemptSettledRef.current = true;
      const word = activeWordRef.current;
      if (!word || questionRunRef.current !== run) return;

      // 最有力の変換が同音異義語で外れることがあるので、候補全体で突き合わせる。
      // 候補がどれも別の漢字になったぶんは、認識側が添えてくれた読みで拾う。
      const heard = [transcript, ...alternatives].filter(Boolean);
      const correct = directionRef.current === 'en-to-ja'
        // 主たる訳だけでなく、ぶら下がっている訳もすべて対象にする。
        // 「、」で並んだ意味は、この先の区切り処理で1つずつに割れる。
        ? isAnyJapaneseAnswerCorrect(heard, combineWordMeanings(word), readings)
        : isAnyEnglishAnswerCorrect(heard, word.english);

      // 音声認識自体が失敗した場合は、ユーザーの責任ではないので再挑戦させずに確定する。
      if (correct || apiErrored || !canRetryVoiceQuiz(attemptRef.current, attemptsAllowedRef.current)) {
        await finishQuestion(transcript, correct, apiErrored);
        return;
      }

      // まだ試行回数が残っているので「もう一回!」と促してから聞き直す。
      timerStartRef.current = null;
      playAnswerFeedbackSound(false);
      const retryPrompt = pickVoiceQuizRetryPrompt(attemptRef.current - 1);
      setRecognizedText(transcript);
      setRetryMessage(retryPrompt);
      setPhase('retrying');

      await speakVoiceQuiz(retryPrompt, 'ja');
      if (questionRunRef.current !== run) return;

      attemptRef.current += 1;
      setAttemptNumber(attemptRef.current);
      startListeningRef.current(run);
    },
    [finishQuestion],
  );

  /**
   * 続けても落ちる失敗で、セッションを止める。
   * 読み上げも録音も切り、run を進めて進行中のコールバックを無効にしてから
   * 理由を出す —— 黙って全問を不正解にするより、何が起きたかを見せる。
   */
  const blockSession = useCallback((message: string) => {
    questionRunRef.current += 1;
    try { recorderRef.current?.stop(); } catch {}
    stopSpeaking();
    stopVoiceQuizAudio();
    timerStartRef.current = null;
    setBlockedMessage(message || '音声認識に失敗しました。時間をおいてお試しください。');
  }, []);

  /** 録音+カウントダウンを開始する。1問の中で試行のたびに呼ばれる。 */
  const startListening = useCallback(
    (run: number) => {
      if (!streamRef.current || !recordingRef.current) return;

      attemptSettledRef.current = false;
      chunksRef.current = [];
      setRecognizedText('');
      setRecognitionErrorMessage('');
      setRetryMessage('');
      setTimeLeft(durationMsRef.current);
      setPhase('listening');
      timerStartRef.current = Date.now();

      const { mimeType } = recordingRef.current;
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        void (async () => {
          if (questionRunRef.current !== run) return;
          setPhase('grading');
          // 例外になったときも大きさが分かるように、try の外で覚えておく。
          // 送れない原因が録音の大きさに依るかどうかは、これが無いと分からない。
          let recordedBytes = 0;
          try {
            // 要求した mimeType ではなく、MediaRecorder が実際に採用した型で判断する。
            const recordedMimeType = recorder.mimeType || mimeType || '';
            const blob = new Blob(chunksRef.current, { type: recordedMimeType });
            recordedBytes = blob.size;

            if (blob.size === 0) {
              console.error(`Voice quiz recording empty (mimeType=${recordedMimeType})`);
              consecutiveRecognitionErrorsRef.current += 1;
              setRecognitionErrorMessage(`録音できませんでした (${recordedMimeType || '形式不明'})`);
              await handleAttemptResult('', true, run);
              return;
            }

            // opus で録れていればそのまま送る。iOS Safari の mp4(AAC) は
            // GCPが受け取れないので、ここでデコードして生PCMに直す。
            const passthrough = passthroughEncodingFor(recordedMimeType);
            const converted = passthrough ? null : await toLinear16(blob);

            if (!passthrough && !converted) {
              console.error(
                `Voice quiz recording unusable (mimeType=${recordedMimeType}, bytes=${blob.size})`,
              );
              consecutiveRecognitionErrorsRef.current += 1;
              setRecognitionErrorMessage(`この端末の録音形式を変換できませんでした (${recordedMimeType || '形式不明'})`);
              await handleAttemptResult('', true, run);
              return;
            }

            const audioBase64 = bytesToBase64(
              converted ? converted.pcm : new Uint8Array(await blob.arrayBuffer()),
            );
            const response = await fetch('/api/voice-quiz/recognize', {
              method: 'POST',
              headers: await recognizeRequestHeaders(),
              body: JSON.stringify({
                audioBase64,
                encoding: passthrough ?? 'LINEAR16',
                ...(converted ? { sampleRateHertz: converted.sampleRateHertz } : {}),
                languageCode: recognitionLanguageFor(directionRef.current),
                // 期待する表記をヒントに渡す。日本語は同音異義語の変換先を寄せるため、
                // 英語は綴りの近い語に流れるのを防ぐため。
                phraseHints: directionRef.current === 'en-to-ja'
                  // ヒントは boost 付きで認識側に渡る。主たる訳以外の意味も
                  // 渡しておかないと、そちらを答えたときに変換が寄らない。
                  ? japaneseAnswerHints(
                    activeWordRef.current ? combineWordMeanings(activeWordRef.current) : '',
                  )
                  : [activeWordRef.current?.english ?? ''].filter(Boolean),
              }),
            });
            const data = await response.json().catch(() => null);
            if (questionRunRef.current !== run) return;
            if (!response.ok || !data?.success) {
              const message = typeof data?.error === 'string' && data.error
                ? data.error
                : `サーバーが応答しませんでした (HTTP ${response.status})`;

              // 上限・未設定・未ログインは、次の問題でも同じように落ちる。
              // 残りを機械的に失敗させても得るものが無いので、ここで止める。
              const hopeless = Boolean(data?.limitReached)
                || response.status === 401
                || response.status === 500;

              consecutiveRecognitionErrorsRef.current += 1;
              const givenUp =
                consecutiveRecognitionErrorsRef.current >= MAX_CONSECUTIVE_RECOGNITION_ERRORS;

              if (hopeless || givenUp) {
                blockSession(message);
                return;
              }

              setRecognitionErrorMessage(message);
              await handleAttemptResult('', true, run);
              return;
            }
            consecutiveRecognitionErrorsRef.current = 0;
            await handleAttemptResult(
              typeof data.transcript === 'string' ? data.transcript : '',
              false,
              run,
              Array.isArray(data.alternatives)
                ? data.alternatives.filter((item: unknown): item is string => typeof item === 'string')
                : [],
              readingsFromResponse(data.readings),
            );
          } catch (error) {
            if (questionRunRef.current !== run) return;
            // 例外の中身まで出す。ここだけ文言が空で、端末に何が起きたのか
            // 画面からは分からなかった (PWAではコンソールも開けない)。
            const detail = [
              error instanceof Error ? `${error.name}: ${error.message}` : String(error),
              `${Math.round(recordedBytes / 1024)}KB`,
            ].join(', ');
            console.error('Voice quiz recognize threw:', error);
            consecutiveRecognitionErrorsRef.current += 1;
            if (consecutiveRecognitionErrorsRef.current >= MAX_CONSECUTIVE_RECOGNITION_ERRORS) {
              blockSession(`音声を送れませんでした (${detail})`);
              return;
            }
            setRecognitionErrorMessage(`音声を送れませんでした (${detail})`);
            await handleAttemptResult('', true, run);
          }
        })();
      };

      recorderRef.current = recorder;
      recorder.start();
    },
    [handleAttemptResult, blockSession],
  );

  startListeningRef.current = startListening;

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const startQuestion = useCallback((word: Word) => {
    if (!word || !streamRef.current || !recordingRef.current) return;

    activeWordRef.current = word;
    const run = questionRunRef.current + 1;
    questionRunRef.current = run;
    attemptRef.current = 1;
    attemptSettledRef.current = false;
    setAttemptNumber(1);
    setRetryMessage('');
    setRecognizedText('');
    setIsCorrect(false);
    setIsDisqualified(false);
    setGaveUp(false);
    setRecognitionErrored(false);
    setTimeLeft(durationMsRef.current);
    setPhase('narrating');

    void (async () => {
      // 出題文は1文だが、英単語の部分だけ英語の声に切り替える。
      // 日本語の声で英単語を読ませると別の単語に聞こえてしまうため。
      const segments = buildVoiceQuizPromptFor(
        directionRef.current,
        word,
        promptOffsetRef.current + run,
      );
      for (const segment of segments) {
        await speakVoiceQuiz(segment.text, segment.lang, { variable: segment.variable });
        if (questionRunRef.current !== run) return;
      }
      startListeningRef.current(run);
    })();
  }, []);

  // カウントダウン(listening中のみ)。時間切れで録音を止め、採点へ進む。
  useEffect(() => {
    if (phase !== 'listening') return;

    const tick = () => {
      if (!timerStartRef.current || attemptSettledRef.current) return;
      const remaining = Math.max(0, durationMsRef.current - (Date.now() - timerStartRef.current));
      setTimeLeft(remaining);
      if (remaining <= 0) stopRecording();
    };

    const intervalId = setInterval(tick, TIMER_TICK_MS);
    return () => clearInterval(intervalId);
  }, [phase, stopRecording]);

  const moveToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= words.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex(nextIndex);
    startQuestion(words[nextIndex]);
  }, [currentIndex, words, startQuestion]);

  // finishQuestion が words を書き換えると moveToNext の同一性が変わる。
  // タイマーを張り直さないよう、効果の依存からは外して ref 経由で呼ぶ。
  const moveToNextRef = useRef(moveToNext);
  moveToNextRef.current = moveToNext;

  /**
   * 解答後は「次へ」を押さなくても自動で次の問題へ進む。
   * ボタンは早送り用に残してあるので、待ちたくないときは従来どおり押せる。
   */
  useEffect(() => {
    // 中断の確認中は、裏で問題が進んでしまわないように止めておく。
    if (phase !== 'answered' || showStopConfirm) return;
    const delay = isCorrect ? AUTO_ADVANCE_CORRECT_MS : AUTO_ADVANCE_INCORRECT_MS;
    const timeoutId = window.setTimeout(() => moveToNextRef.current(), delay);
    return () => window.clearTimeout(timeoutId);
  }, [phase, isCorrect, showStopConfirm]);

  /**
   * 「わからない」。答えをすぐ出す。
   *
   * 録音は捨て、音声認識には一切かけない —— 分からないと分かっている発話を
   * 送っても、待ち時間とAPI利用が増えるだけで得るものが無い。
   * run を進めてから recorder を止めるので、進行中の onstop は送信前に降りる。
   */
  const giveUp = useCallback(() => {
    if (attemptSettledRef.current) return;
    attemptSettledRef.current = true;
    questionRunRef.current += 1;
    try { recorderRef.current?.stop(); } catch {}
    stopSpeaking();
    stopVoiceQuizAudio();
    timerStartRef.current = null;
    void finishQuestion('', false, false, true);
  }, [finishQuestion]);

  /**
   * 中断の確認を開く。開いている間はクイズを完全に止める。
   * 進行中の読み上げ・録音を切り、run を進めて解決済みのコールバックを無効化する
   * (これをしないと、確認中に録音が採点まで走ってしまう)。
   */
  const requestStop = useCallback(() => {
    questionRunRef.current += 1;
    try { recorderRef.current?.stop(); } catch {}
    stopSpeaking();
    stopVoiceQuizAudio();
    timerStartRef.current = null;
    setShowStopConfirm(true);
  }, []);

  /** 中断をやめて、いまの問題を最初から出題し直す。 */
  const resumeQuiz = useCallback(() => {
    setShowStopConfirm(false);
    const word = activeWordRef.current;
    if (word) startQuestion(word);
  }, [startQuestion]);

  /** ここまでの成績で結果画面へ進む。 */
  const finishEarly = useCallback(() => {
    setShowStopConfirm(false);
    setIsComplete(true);
  }, []);

  /** 記録を見ずに単語帳へ戻る。 */
  const exitQuiz = useCallback(() => {
    setShowStopConfirm(false);
    backToProject();
  }, [backToProject]);

  const beginSession = (attempts: number, seconds: number) => {
    if (words.length === 0) return;
    // 事前生成の音声はユーザー操作の中で一度解錠しないと鳴らない。
    // ここを通さないと、インストール済みPWAでは全部が合成音声に落ちる。
    primeVoiceQuizAudio();
    setBlockedMessage('');
    consecutiveRecognitionErrorsRef.current = 0;
    directionRef.current = direction;
    attemptsAllowedRef.current = normalizeVoiceQuizAttempts(attempts);
    setAttemptsAllowed(attemptsAllowedRef.current);

    const normalizedSeconds = normalizeVoiceQuizDuration(seconds);
    durationMsRef.current = normalizedSeconds * 1000;
    setDurationSec(normalizedSeconds);
    setTimeLeft(durationMsRef.current);

    setCurrentIndex(0);
    setHasStarted(true);
    startQuestion(words[0]);
  };

  const restartSession = () => {
    setBlockedMessage('');
    consecutiveRecognitionErrorsRef.current = 0;
    setCurrentIndex(0);
    setResults({ correct: 0, total: 0, disqualified: 0 });
    setIsComplete(false);
    questionRunRef.current = 0;
    setHasStarted(false);
  };

  /**
   * 同じ設定のまま、単語帳の次のひと組へ進む。
   * 試行回数も解答時間も選び直させない —— 続けて解きたいから押すボタンで、
   * 開始画面に戻すと10問ごとに同じ設定を選ばされる。
   */
  const startNextBatch = () => {
    const nextWord = pool[nextStart];
    if (!nextWord) return;

    // 結果画面から直に出題へ入るので、ここでも解錠しておく
    // (音声セッションが切れた端末では、操作のたびに通し直すのが確実)。
    primeVoiceQuizAudio();
    setBlockedMessage('');
    consecutiveRecognitionErrorsRef.current = 0;
    setBatchStart(nextStart);
    setCurrentIndex(0);
    setResults({ correct: 0, total: 0, disqualified: 0 });
    setIsComplete(false);
    startQuestion(nextWord);
  };

  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop(); } catch {}
      stopSpeaking();
    stopVoiceQuizAudio();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Render ---

  if (loading || setupState === 'checking' || !modeLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">
            {setupState === 'checking' ? 'マイクを確認中...' : '準備中...'}
          </p>
        </div>
      </div>
    );
  }

  // 四択が選ばれている: 送るまで音読の画面は描かない (マイクも起こさない)。
  if (storedMode === 'normal') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">通常クイズを開いています...</p>
        </div>
      </div>
    );
  }

  // この端末でまだ形式を選んでいない。解き始める前に一度だけ選ばせる。
  if (storedMode === null) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
          <CloseButton onClick={backToProject} />
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <QuizModeChooser onSelect={chooseMode} />
        </main>
      </div>
    );
  }

  if (prepareError) {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="error"
        title="問題の準備に失敗しました"
        message="通信状況を確認して、もう一度お試しください。"
      />
    );
  }

  // 認識が続けて落ちる状態。理由を出して、解いたぶんの結果だけは見せる。
  if (blockedMessage) {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="mic_off"
        title="音声認識を続けられません"
        message={blockedMessage}
        action={
          results.total > 0
            ? {
                label: 'ここまでの結果を見る',
                onClick: () => {
                  setBlockedMessage('');
                  setIsComplete(true);
                },
              }
            : undefined
        }
      />
    );
  }

  if (setupState === 'unsupported') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="mic_off"
        title="このブラウザでは音読チャレンジがサポートされていません"
        message="Google Chrome または Microsoft Edge で開き直してください。"
      />
    );
  }

  if (setupState === 'mic-denied') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="mic_off"
        title="マイクへのアクセスが許可されていません"
        message="ブラウザの設定でマイクへのアクセスを許可してから、もう一度お試しください。"
      />
    );
  }

  // 開始画面。ここで試行回数を選ぶ。
  // 「開始」タップがユーザー操作になるので、多くのブラウザが要求する
  // 音声合成の発火条件(ユーザージェスチャー)も同時に満たせる。
  if (!hasStarted) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
          <CloseButton onClick={backToProject} />
        </header>

        {/*
          設定を一画面に収める。開始前に読むものはここで全部で、
          スクロールして探させるほどの中身ではない。
        */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-2 overflow-y-auto">
          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-5 text-center animate-fade-in-up')}>
            {/* 見出しは横並び。大きなアイコンを積むだけで100px使っていた。 */}
            <div className="flex items-center gap-3 text-left">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]',
                  HARD_SHADOW_SM,
                )}
              >
                <Icon name="mic" size={22} className="text-[var(--color-accent-ink)]" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-xl font-black leading-tight text-[var(--solid-ink)]">
                  音読チャレンジ
                </h1>
                {/* 向きは下のボタンが示すので、ここでは繰り返さない。 */}
                <p className="mt-0.5 text-xs leading-5 text-[var(--color-muted)]">
                  全{words.length}問 ・ {durationSec}秒以内に声で答えます
                </p>
              </div>
            </div>

            <p className={cn(EYEBROW, 'mt-5 mb-2 text-left text-[var(--color-muted)]')}>出題の向き</p>
            <div className="flex gap-2" role="group" aria-label="出題の向き">
              {([
                { key: 'en-to-ja' as const, label: '英 → 日', hint: '意味を日本語で' },
                { key: 'ja-to-en' as const, label: '日 → 英', hint: '英単語を英語で' },
              ]).map((option) => {
                const selected = direction === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDirection(option.key)}
                    className={cn(
                      'flex-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] px-2 py-2 transition-all duration-100 active:translate-x-px active:translate-y-px',
                      selected
                        ? cn('bg-[var(--solid-ink)] text-[var(--color-surface)]', HARD_SHADOW_SM)
                        : 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
                    )}
                  >
                    <span className="block font-display text-base font-black">{option.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[10px] font-bold',
                        selected ? 'text-[var(--color-surface)]/70' : 'text-[var(--color-muted)]',
                      )}
                    >
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            <SegmentedOptions
              label="解答時間"
              options={VOICE_QUIZ_DURATION_OPTIONS}
              // 自由入力中はどの定型も選択状態にしない。
              selected={isCustomDuration ? -1 : durationSec}
              onSelect={(option) => {
                setDurationSec(option);
                setCustomDurationText('');
              }}
              format={(option) => `${option}秒`}
              className="mt-4"
              extra={
                <label
                  className={cn(
                    'flex flex-1 items-center gap-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] px-2 py-3 transition-all duration-100',
                    isCustomDuration
                      ? cn('bg-[var(--solid-ink)]', HARD_SHADOW_SM)
                      : 'bg-[var(--color-surface)]',
                  )}
                >
                  <span className="sr-only">解答時間を秒で入力</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_VOICE_QUIZ_DURATION_SEC}
                    max={MAX_VOICE_QUIZ_DURATION_SEC}
                    value={customDurationText}
                    placeholder="任意"
                    onChange={(event) => {
                      const raw = event.target.value;
                      setCustomDurationText(raw);
                      if (raw.trim() !== '') setDurationSec(normalizeVoiceQuizDuration(raw));
                    }}
                    // 入力途中の値は丸めず、確定時にだけ範囲へ収める。
                    onBlur={() => {
                      if (customDurationText.trim() === '') return;
                      const clamped = normalizeVoiceQuizDuration(customDurationText);
                      setCustomDurationText(String(clamped));
                      setDurationSec(clamped);
                    }}
                    className={cn(
                      'w-full min-w-0 bg-transparent text-center font-display text-base font-black outline-none',
                      isCustomDuration
                        ? 'text-[var(--color-surface)] placeholder:text-[var(--color-surface)]/60'
                        : 'text-[var(--solid-ink)] placeholder:text-[var(--color-muted)]',
                    )}
                  />
                  <span
                    className={cn(
                      'shrink-0 font-display text-base font-black',
                      isCustomDuration ? 'text-[var(--color-surface)]' : 'text-[var(--solid-ink)]',
                    )}
                  >
                    秒
                  </span>
                </label>
              }
            />
            <SegmentedOptions
              label="試行回数"
              options={VOICE_QUIZ_ATTEMPT_OPTIONS}
              selected={attemptsAllowed}
              onSelect={setAttemptsAllowed}
              format={(option) => `${option}回`}
              className="mt-4"
            />

            {/*
              解説は選んだ設定ぶんの1行だけ。高さを固定して、選び直すたびに
              下のボタンが動かないようにする。
            */}
            <p className="mt-3 mb-4 min-h-[2rem] text-left text-xs leading-4 text-[var(--color-muted)]">
              {attemptsAllowed === 1
                ? '1回でも間違えるとその問題は終了します。'
                : `間違えても最大${attemptsAllowed}回まで挑戦できます。`}
              <br />
              答え終わったら「話し終わった」で、待たずに次へ進めます。
            </p>

            <SolidButton
              variant="accent"
              size="lg"
              iconRight="arrow_forward"
              onClick={() => beginSession(attemptsAllowed, durationSec)}
              className={cn('w-full', HARD_SHADOW)}
            >
              開始する
            </SolidButton>
          </div>
        </main>
      </div>
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    const completionMessage = percentage === 100
      ? 'パーフェクト! 素晴らしい!'
      : percentage >= 80
      ? 'よくできました!'
      : percentage >= 60
      ? 'もう少し! 復習しましょう'
      : '繰り返し練習しましょう!';

    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
          <CloseButton onClick={backToProject} />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
            <div
              className={cn(
                'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border-2 border-[var(--solid-ink)] bg-[var(--color-success-light)]',
                HARD_SHADOW_SM,
              )}
            >
              <Icon name="emoji_events" size={38} className="text-[var(--color-success)]" />
            </div>

            <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Result</p>
            <h1 className="mt-1 font-display text-[1.6rem] font-black leading-tight text-[var(--solid-ink)]">
              音読チャレンジ完了!
            </h1>

            <p className="mt-5 font-mono text-[3.75rem] font-black leading-none tabular-nums text-[var(--solid-ink)]">
              {percentage}
              <span className="text-2xl">%</span>
            </p>

            {/* 正答率バー。数字だけより結果の重みが伝わる。 */}
            <div className="mx-auto mt-4 h-3 w-full overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-[width] duration-700 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatChip icon="check" label="正解" value={`${results.correct}/${results.total}`} />
              <StatChip
                icon={results.disqualified > 0 ? 'timer_off' : 'timer'}
                label="失格"
                value={`${results.disqualified}回`}
                tone={results.disqualified > 0 ? 'error' : 'default'}
              />
            </div>

            <p className="mt-6 font-display text-base font-black text-[var(--solid-ink)]">{completionMessage}</p>

            <div className="mt-7 space-y-3">
              {/*
                同じ10問をもう一度やるより、単語帳の先へ進みたい。
                残りが尽きたときだけ「もう一度」に戻す —— 進む先が無いのに
                「次の◯問」を出すわけにいかないし、押せる手を消したくない。
              */}
              {nextBatchSize > 0 ? (
                <SolidButton
                  variant="accent"
                  size="lg"
                  iconLeft="arrow_forward"
                  onClick={startNextBatch}
                  className={cn('w-full', HARD_SHADOW)}
                >
                  次の{nextBatchSize}問
                </SolidButton>
              ) : (
                <SolidButton
                  variant="accent"
                  size="lg"
                  iconLeft="refresh"
                  onClick={restartSession}
                  className={cn('w-full', HARD_SHADOW)}
                >
                  もう一度
                </SolidButton>
              )}
              <SolidButton size="lg" onClick={backToProject} className={cn('w-full', HARD_SHADOW_SM)}>
                単語一覧に戻る
              </SolidButton>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 残り時間の色。1秒を切ったら赤、2秒を切ったら警告色。
  const timerTone =
    timeLeft <= 1000
      ? 'var(--color-error, #ef4444)'
      : timeLeft <= 2000
      ? 'var(--color-warning)'
      : 'var(--color-accent)';
  const answeredCount = currentIndex + (phase === 'answered' ? 1 : 0);
  const autoAdvanceMs = isCorrect ? AUTO_ADVANCE_CORRECT_MS : AUTO_ADVANCE_INCORRECT_MS;
  const isLastQuestion = currentIndex + 1 >= words.length;

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 flex items-center gap-3 p-4 safe-area-top">
        {/*
          アイコンだけだと終了できると分からないので、文字を出す。
          指で押せる大きさ (44px) を確保する —— 画面いっぱいのクイズから
          抜ける唯一の導線なので、小さくて押しにくいでは困る。
        */}
        <button
          type="button"
          onClick={requestStop}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 font-display text-sm font-black text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px',
            HARD_SHADOW_SM,
          )}
        >
          <Icon name="close" size={17} />
          終了
        </button>

        <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${(answeredCount / words.length) * 100}%` }}
          />
        </div>

        <span className="font-mono text-xs font-black tabular-nums text-[var(--solid-ink)]">
          {currentIndex + 1}/{words.length}
        </span>

        {/* 解いている途中でも形式を変えられるようにする。 */}
        <button
          type="button"
          onClick={() => setShowModeSwitch(true)}
          aria-label="クイズの解き方を変える"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[var(--solid-ink)]"
        >
          <Icon name="tune" size={19} />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 overflow-y-auto">
        {currentWord && (
          <div className="w-full max-w-sm animate-fade-in-up">
            {/* 出題中の意味。英単語は伏せたまま、何を聞かれているかを目でも追えるようにする。 */}
            {phase !== 'answered' && (
              <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'mb-7 px-5 py-4 text-center')}>
                <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Question</p>
                <p className="mt-1.5 font-display text-[1.75rem] font-black leading-tight text-[var(--solid-ink)]">
                  {askingForJapanese ? currentWord.english : currentWord.japanese}
                </p>
                {askingForJapanese && currentWord.pronunciation && (
                  <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
                    {currentWord.pronunciation}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col items-center gap-4 text-center">
              {phase === 'narrating' && (
                <>
                  <div
                    className={cn(
                      'flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]',
                      HARD_SHADOW,
                    )}
                  >
                    <SoundWave />
                    <span className={cn(EYEBROW, 'text-[var(--color-accent-ink)]')}>Speaking</span>
                  </div>
                  <p className="font-display text-base font-black text-[var(--solid-ink)]">
                    問題を読み上げています...
                  </p>
                </>
              )}

              {phase === 'listening' && (
                <>
                  {/* アイコンではなく残り秒数そのものを大きく出す。 */}
                  <div className="relative h-40 w-40">
                    <CountdownRing progress={timeLeft / durationMs} tone={timerTone} />
                    <div
                      className={cn(
                        'absolute inset-[20px] flex flex-col items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]',
                        HARD_SHADOW_SM,
                      )}
                    >
                      <span
                        className="font-mono text-[2.75rem] font-black leading-none tabular-nums"
                        style={{ color: timerTone }}
                      >
                        {Math.ceil(timeLeft / 1000)}
                      </span>
                      <span className={cn(EYEBROW, 'mt-1.5 text-[var(--color-muted)]')}>秒</span>
                    </div>
                  </div>

                  {/* 録音中であることを言葉でも示す。 */}
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-error,#ef4444)] animate-pulse" />
                    <p className="font-display text-base font-black text-[var(--solid-ink)]">
                      録音中 — {askingForJapanese ? '日本語で意味を答えてください' : '英語で答えてください'}
                    </p>
                  </div>

                  {attemptsAllowed > 1 && <AttemptPill current={attemptNumber} total={attemptsAllowed} />}

                  {/* 時間切れを待たずに送れるようにする。何をすればいいかも明示される。 */}
                  <SolidButton
                    variant="accent"
                    size="lg"
                    iconLeft="check"
                    onClick={stopRecording}
                    className={cn('mt-1 w-full', HARD_SHADOW)}
                  >
                    話し終わった
                  </SolidButton>

                  {/* 音声認識にかけず、すぐ答えを出す。 */}
                  <SolidButton
                    size="md"
                    iconLeft="help"
                    onClick={giveUp}
                    className={cn('w-full', HARD_SHADOW_SM)}
                  >
                    わからない
                  </SolidButton>
                </>
              )}

              {phase === 'grading' && (
                <>
                  <div
                    className={cn(
                      'flex h-36 w-36 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]',
                      HARD_SHADOW,
                    )}
                  >
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                  </div>
                  <p className="font-display text-base font-black text-[var(--color-muted)]">採点中...</p>
                </>
              )}

              {phase === 'retrying' && (
                <>
                  <PhaseOrb
                    icon="refresh"
                    className="bg-[var(--color-warning-light)]"
                    iconClassName="text-[var(--color-warning)]"
                  />
                  <p className="font-display text-xl font-black text-[var(--color-warning)]">{retryMessage}</p>
                  {recognizedText && <MisheardText text={recognizedText} />}
                  <AttemptPill current={attemptNumber} total={attemptsAllowed} remaining />
                </>
              )}

              {phase === 'answered' && (
                <>
                  <PhaseOrb
                    icon={isCorrect ? 'check' : gaveUp ? 'help' : isDisqualified ? 'timer_off' : 'close'}
                    className={isCorrect ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error,#ef4444)]'}
                    iconClassName="text-white"
                  />
                  <p
                    className={cn(
                      'font-display text-xl font-black',
                      isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error,#ef4444)]',
                    )}
                  >
                    {isCorrect ? '正解!' : gaveUp ? 'わからない' : isDisqualified ? '失格!' : '不正解'}
                  </p>
                  {recognitionErrored && (
                    <p className="text-xs text-[var(--color-muted)]">
                      {recognitionErrorMessage || '音声認識に失敗しました'}
                    </p>
                  )}
                  {recognizedText && !isCorrect && !isDisqualified && <MisheardText text={recognizedText} />}

                  <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'mt-1 w-full px-5 py-4')}>
                    <p className={cn(EYEBROW, 'text-[var(--color-muted)]')}>Answer</p>
                    {/* 意味は4択クイズと同じく、主たる訳だけでなく全部出す
                        (判定もすべての意味を正解として扱っているため) */}
                    <p className="mt-1 font-display text-[1.75rem] font-black leading-tight text-[var(--solid-ink)]">
                      {askingForJapanese
                        ? <TranslationDisplay word={currentWord} />
                        : currentWord.english}
                    </p>
                    <p className="mt-1 font-mono text-sm text-[var(--color-muted)]">
                      {askingForJapanese
                        ? currentWord.english
                        : <TranslationDisplay word={currentWord} compact />}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {phase === 'answered' && (
        <div className="flex-shrink-0 bg-[var(--color-background)] px-6 pt-3 pb-6 safe-area-bottom">
          <div className="mx-auto w-full max-w-lg">
            {/* 自動で次へ進むまでの残り時間。待ちたくなければボタンを押せばすぐ進む。 */}
            <p className={cn(EYEBROW, 'mb-1.5 text-center text-[var(--color-muted)]')}>
              {isLastQuestion ? 'まもなく結果へ' : 'まもなく次の問題へ'}
            </p>
            <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                key={currentIndex}
                className="voice-quiz-drain h-full rounded-full bg-[var(--solid-ink)]"
                style={{ '--voice-quiz-drain': `${autoAdvanceMs}ms` } as CSSProperties}
              />
            </div>
            <SolidButton
              variant="inverse"
              size="lg"
              iconRight="chevron_right"
              onClick={moveToNext}
              className={cn('w-full', HARD_SHADOW)}
            >
              {isLastQuestion ? '結果を見る' : '次へ進む'}
            </SolidButton>
          </div>
        </div>
      )}

      <Modal
        isOpen={showStopConfirm}
        onClose={resumeQuiz}
        showCloseButton={false}
        className={cn(
          'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] shadow-none',
          HARD_SHADOW,
        )}
      >
        <div className="p-6 text-center">
          <p className={cn(EYEBROW, 'text-[var(--color-muted)]')}>Pause</p>
          <h2 className="mt-1 font-display text-xl font-black text-[var(--solid-ink)]">
            音読チャレンジを中断しますか?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            全{words.length}問中 {answeredCount}問おわりました。
            {results.total > 0 && `（正解 ${results.correct}問）`}
          </p>

          <div className="mt-6 space-y-2.5">
            <SolidButton
              variant="accent"
              size="lg"
              iconLeft="play_arrow"
              onClick={resumeQuiz}
              className={cn('w-full', HARD_SHADOW)}
            >
              続ける
            </SolidButton>

            {/* 1問も解いていないときは見せる結果が無いので出さない。 */}
            {results.total > 0 && (
              <SolidButton
                size="lg"
                iconLeft="flag"
                onClick={finishEarly}
                className={cn('w-full', HARD_SHADOW_SM)}
              >
                ここまでの結果を見る
              </SolidButton>
            )}

            <button
              type="button"
              onClick={exitQuiz}
              className="w-full py-2 text-sm font-bold text-[var(--color-muted)] underline underline-offset-4"
            >
              記録せずに戻る
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showModeSwitch}
        onClose={() => setShowModeSwitch(false)}
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <QuizModeChooser
          current="voice"
          onSelect={chooseMode}
          onCancel={() => setShowModeSwitch(false)}
          title="クイズの解き方を変える"
          description="この端末での既定として覚えます。"
          warning={
            hasStarted && !isComplete
              ? '四択に切り替えると、いまの音読チャレンジは記録されずに終わります。'
              : undefined
          }
        />
      </Modal>
    </div>
  );
}

function CloseButton({ onClick, label = '閉じる' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px',
        HARD_SHADOW_SM,
      )}
    >
      <Icon name="close" size={20} />
    </button>
  );
}

/** 開始画面の設定行。解答時間と試行回数で見た目を揃える。 */
function SegmentedOptions({
  label,
  options,
  selected,
  onSelect,
  format,
  className,
  extra,
}: {
  label: string;
  options: readonly number[];
  selected: number;
  onSelect: (option: number) => void;
  format: (option: number) => string;
  className?: string;
  /** 定型の選択肢のあとに並べる自由入力など。 */
  extra?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className={cn(EYEBROW, 'mb-2 text-left text-[var(--color-muted)]')}>{label}</p>
      <div className="flex gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option)}
              className={cn(
                'flex-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] py-3 font-display text-base font-black transition-all duration-100 active:translate-x-px active:translate-y-px',
                isSelected
                  ? cn('bg-[var(--solid-ink)] text-[var(--color-surface)]', HARD_SHADOW_SM)
                  : 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
              )}
            >
              {format(option)}
            </button>
          );
        })}
        {extra}
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'default' | 'error';
}) {
  const errorTone = tone === 'error';
  return (
    <div className="rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-left">
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          size={14}
          className={errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--color-muted)]'}
        />
        <span className={cn(EYEBROW, 'text-[var(--color-muted)]')}>{label}</span>
      </div>
      <p
        className={cn(
          'mt-0.5 font-mono text-base font-black tabular-nums',
          errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--solid-ink)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** 各フェーズの中央に置く大きな円。 */
function PhaseOrb({
  icon,
  className,
  iconClassName,
}: {
  icon: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-36 w-36 items-center justify-center rounded-full border-2 border-[var(--solid-ink)]',
        HARD_SHADOW,
        className,
      )}
    >
      <Icon name={icon} size={52} className={iconClassName} />
    </div>
  );
}

/** 残り時間を示すリング。中央のマイクを囲む。 */
function CountdownRing({ progress, tone }: { progress: number; tone: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
      <circle cx="60" cy="60" r={radius + 4} fill="none" stroke="var(--solid-ink)" strokeWidth="2" />
    </svg>
  );
}

/** 読み上げ中のイコライザ。 */
function SoundWave() {
  return (
    <div className="flex h-6 items-end gap-1.5" aria-hidden="true">
      {[0, 140, 280, 420, 560].map((delay) => (
        <span
          key={delay}
          className="voice-quiz-wave block h-6 w-1.5 rounded-full bg-[var(--color-accent)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

/** 何回目の試行かを示すピル。 */
function AttemptPill({
  current,
  total,
  remaining,
}: {
  current: number;
  total: number;
  remaining?: boolean;
}) {
  return (
    <span className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] font-black tabular-nums text-[var(--solid-ink)]">
      {remaining ? `残り${total - current}回` : `${current} / ${total}`}
    </span>
  );
}

/** 認識された(=間違えた)発話。 */
function MisheardText({ text }: { text: string }) {
  return <p className="font-mono text-sm text-[var(--color-muted)] line-through">{text}</p>;
}

function NoticeScreen({
  onBack,
  icon,
  title,
  message,
  action,
}: {
  onBack: () => void;
  icon: string;
  title: string;
  message: string;
  /** 戻る以外にできることがあるとき (途中まで解いた結果を見る、など)。 */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
        <CloseButton onClick={onBack} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
          <div
            className={cn(
              'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-warning-light)]',
              HARD_SHADOW_SM,
            )}
          >
            <Icon name={icon} size={30} className="text-[var(--color-warning)]" />
          </div>
          <p className="font-display text-lg font-black leading-snug text-[var(--solid-ink)]">{title}</p>
          <p className="mt-3 mb-6 text-sm leading-6 text-[var(--color-muted)]">{message}</p>
          {action && (
            <SolidButton
              variant="accent"
              size="lg"
              onClick={action.onClick}
              className={cn('mb-3 w-full', HARD_SHADOW)}
            >
              {action.label}
            </SolidButton>
          )}
          <SolidButton size="lg" onClick={onBack} className={cn('w-full', HARD_SHADOW_SM)}>
            戻る
          </SolidButton>
        </div>
      </main>
    </div>
  );
}
