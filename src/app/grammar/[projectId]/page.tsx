'use client';

import { useState, useRef, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  BookText,
  Loader2,
  Check,
  ChevronRight,
  Play,
} from 'lucide-react';
import { ProgressSteps, type ProgressStep } from '@/components/ui';
import { processImageFile } from '@/lib/image-utils';
import { useAuth } from '@/hooks/use-auth';
import type { AIGrammarExtraction, EikenGrammarLevel } from '@/types';

// EIKEN level options for the dropdown
const EIKEN_LEVELS: { value: EikenGrammarLevel; label: string }[] = [
  { value: null, label: 'フィルターなし' },
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

// Grammar pattern card component
function GrammarPatternCard({
  pattern,
  isExpanded,
  onToggle,
  onStartQuiz,
}: {
  pattern: AIGrammarExtraction;
  isExpanded: boolean;
  onToggle: () => void;
  onStartQuiz: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="p-2 bg-emerald-100 rounded-xl">
            <BookText className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{pattern.patternName}</h3>
            <p className="text-sm text-gray-500">{pattern.patternNameEn}</p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          {/* Original sentence */}
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 mb-1">元の文</p>
            <p className="text-gray-900 bg-gray-50 rounded-lg p-3 italic">
              "{pattern.originalSentence}"
            </p>
          </div>

          {/* Structure */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">構造</p>
            <p className="text-blue-600 font-mono bg-blue-50 rounded-lg p-3">
              {pattern.structure}
            </p>
          </div>

          {/* Explanation */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">解説</p>
            <p className="text-gray-700 leading-relaxed">{pattern.explanation}</p>
          </div>

          {/* Example */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">例文</p>
            <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
              <p className="text-emerald-800 font-medium">{pattern.example}</p>
              <p className="text-emerald-600 text-sm">{pattern.exampleJa}</p>
            </div>
          </div>

          {/* Level badge */}
          {pattern.level && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">レベル:</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                英検{pattern.level === 'pre2' ? '準2' : pattern.level === 'pre1' ? '準1' : pattern.level}級
              </span>
            </div>
          )}

          {/* Quiz button */}
          {pattern.quizQuestions && pattern.quizQuestions.length > 0 && (
            <button
              onClick={onStartQuiz}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              <Play className="w-5 h-5" />
              クイズに挑戦 ({pattern.quizQuestions.length}問)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GrammarPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const { isPro } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [patterns, setPatterns] = useState<AIGrammarExtraction[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [selectedEiken, setSelectedEiken] = useState<EikenGrammarLevel>(null);
  const [isEikenDropdownOpen, setIsEikenDropdownOpen] = useState(false);

  // Quiz state
  const [quizMode, setQuizMode] = useState(false);
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const selectedLabel = EIKEN_LEVELS.find(l => l.value === selectedEiken)?.label || 'フィルターなし';

  // Handle image selection and processing
  const handleImageSelect = async (file: File) => {
    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'ocr', label: 'テキストを抽出中...', status: 'pending' },
      { id: 'analyze', label: '文法を解析中...', status: 'pending' },
    ]);

    try {
      // Process image
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch {
        throw new Error('画像の処理に失敗しました');
      }

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (!result || !result.includes(',')) {
            reject(new Error('画像データの読み取りに失敗しました'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('ファイルの読み取りに失敗しました'));
        reader.readAsDataURL(processedFile);
      });

      setProcessingSteps(prev =>
        prev.map(s =>
          s.id === 'upload' ? { ...s, status: 'complete' } :
          s.id === 'ocr' ? { ...s, status: 'active' } : s
        )
      );

      // Call grammar API
      const response = await fetch('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, eikenLevel: selectedEiken }),
      });

      setProcessingSteps(prev =>
        prev.map(s =>
          s.id === 'ocr' ? { ...s, status: 'complete' } :
          s.id === 'analyze' ? { ...s, status: 'active' } : s
        )
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '文法解析に失敗しました');
      }

      await new Promise(r => setTimeout(r, 500));

      setProcessingSteps(prev =>
        prev.map(s => s.id === 'analyze' ? { ...s, status: 'complete' } : s)
      );

      setPatterns(result.patterns);
      setExtractedText(result.extractedText);
      setExpandedIndex(0);
      setProcessing(false);
    } catch (error) {
      console.error('Grammar extraction error:', error);
      const errorMessage = error instanceof Error ? error.message : '予期しないエラー';
      setProcessingSteps(prev =>
        prev.map(s =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: errorMessage }
            : s
        )
      );
    }
  };

  // Quiz handlers
  const currentPattern = patterns[currentPatternIndex];
  const currentQuestion = currentPattern?.quizQuestions?.[currentQuestionIndex];

  const handleStartQuiz = (patternIndex: number) => {
    setCurrentPatternIndex(patternIndex);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setQuizMode(true);
  };

  const handleSelectAnswer = (answer: string) => {
    if (showAnswer) return;
    setSelectedAnswer(answer);
    setShowAnswer(true);
  };

  const handleNextQuestion = () => {
    const pattern = patterns[currentPatternIndex];
    if (currentQuestionIndex + 1 < (pattern?.quizQuestions?.length || 0)) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
    } else {
      // Quiz complete
      setQuizMode(false);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  };

  // Quiz mode render
  if (quizMode && currentQuestion) {
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuizMode(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="font-semibold text-gray-900">{currentPattern.patternName}</h1>
                <p className="text-sm text-gray-500">
                  問題 {currentQuestionIndex + 1} / {currentPattern.quizQuestions?.length || 0}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Quiz content */}
        <main className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
          {/* Question */}
          <div className="mb-6">
            <p className="text-lg font-medium text-gray-900 mb-2">
              {currentQuestion.question}
            </p>
            {currentQuestion.questionJa && (
              <p className="text-sm text-gray-500">{currentQuestion.questionJa}</p>
            )}
          </div>

          {/* Options */}
          {currentQuestion.questionType === 'choice' && currentQuestion.options ? (
            <div className="space-y-3 mb-6">
              {currentQuestion.options.map((option, index) => {
                let bgColor = 'bg-white hover:bg-gray-50';
                let borderColor = 'border-gray-200';
                let textColor = 'text-gray-900';

                if (showAnswer) {
                  if (option === currentQuestion.correctAnswer) {
                    bgColor = 'bg-emerald-50';
                    borderColor = 'border-emerald-300';
                    textColor = 'text-emerald-800';
                  } else if (option === selectedAnswer && !isCorrect) {
                    bgColor = 'bg-red-50';
                    borderColor = 'border-red-300';
                    textColor = 'text-red-800';
                  } else {
                    bgColor = 'bg-gray-50';
                    textColor = 'text-gray-400';
                  }
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleSelectAnswer(option)}
                    disabled={showAnswer}
                    className={`w-full p-4 rounded-xl border-2 ${borderColor} ${bgColor} ${textColor} text-left transition-all disabled:cursor-default`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-6">
              <input
                type="text"
                value={selectedAnswer || ''}
                onChange={e => setSelectedAnswer(e.target.value)}
                disabled={showAnswer}
                placeholder="答えを入力..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
              />
              {!showAnswer && (
                <button
                  onClick={() => setShowAnswer(true)}
                  disabled={!selectedAnswer}
                  className="mt-3 w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  回答する
                </button>
              )}
            </div>
          )}

          {/* Answer feedback */}
          {showAnswer && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${isCorrect ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className={`font-medium ${isCorrect ? 'text-emerald-800' : 'text-red-800'}`}>
                  {isCorrect ? '正解!' : '不正解'}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-gray-600 mt-1">
                    正解: {currentQuestion.correctAnswer}
                  </p>
                )}
              </div>

              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-800">{currentQuestion.explanation}</p>
              </div>

              <button
                onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                {currentQuestionIndex + 1 < (currentPattern.quizQuestions?.length || 0) ? (
                  <>
                    次へ
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    完了
                  </>
                )}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            handleImageSelect(file);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="font-semibold text-gray-900">文法スキャン</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
        {/* No patterns yet - show scan UI */}
        {patterns.length === 0 && !processing && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookText className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              英文をスキャンして文法を学習
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              プリントやノートの英文を撮影すると、<br />
              文法パターンを自動で解析します
            </p>

            {/* EIKEN Level Filter */}
            <div className="mb-6 max-w-xs mx-auto">
              <label className="block text-sm font-medium text-gray-700 mb-2 text-left">
                英検レベルでフィルター
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsEikenDropdownOpen(!isEikenDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
                >
                  <span className={selectedEiken ? 'text-gray-900' : 'text-gray-500'}>
                    {selectedLabel}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isEikenDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isEikenDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsEikenDropdownOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-48 overflow-y-auto">
                      {EIKEN_LEVELS.map(level => (
                        <button
                          key={level.value || 'none'}
                          onClick={() => {
                            setSelectedEiken(level.value);
                            setIsEikenDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                            selectedEiken === level.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                          }`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              <Camera className="w-5 h-5" />
              英文をスキャン
            </button>
          </div>
        )}

        {/* Processing modal */}
        {processing && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
              <h2 className="text-base font-medium mb-4 text-center text-gray-900">
                {processingSteps.some(s => s.status === 'error') ? 'エラーが発生しました' : '解析中'}
              </h2>
              <ProgressSteps steps={processingSteps} />
              {processingSteps.some(s => s.status === 'error') && (
                <button
                  onClick={() => setProcessing(false)}
                  className="mt-4 w-full py-2 bg-gray-100 rounded-lg text-gray-700 text-sm hover:bg-gray-200 transition-colors"
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pattern list */}
        {patterns.length > 0 && (
          <div className="space-y-4">
            {/* Extracted text preview */}
            <div className="p-4 bg-gray-50 rounded-xl mb-6">
              <p className="text-xs font-medium text-gray-500 mb-2">抽出されたテキスト</p>
              <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-3">
                {extractedText}
              </p>
            </div>

            {/* Patterns */}
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">
                文法パターン ({patterns.length})
              </h2>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                新しくスキャン
              </button>
            </div>

            {patterns.map((pattern, index) => (
              <GrammarPatternCard
                key={index}
                pattern={pattern}
                isExpanded={expandedIndex === index}
                onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
                onStartQuiz={() => handleStartQuiz(index)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
