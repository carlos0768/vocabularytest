'use client';

import { useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  BookText,
  Check,
  Save,
} from 'lucide-react';
import { ProgressSteps, type ProgressStep, useToast } from '@/components/ui';
import { ScanLimitModal } from '@/components/limits';
import { useAuth } from '@/hooks/use-auth';
import { processImageFile } from '@/lib/image-utils';
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
}: {
  pattern: AIGrammarExtraction;
  isExpanded: boolean;
  onToggle: () => void;
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

          {/* Quiz count */}
          {pattern.quizQuestions && pattern.quizQuestions.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Check className="w-4 h-4 text-emerald-500" />
              {pattern.quizQuestions.length}問のクイズが作成されます
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GrammarScanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, isPro } = useAuth();
  const { showToast } = useToast();

  // State
  const [patterns, setPatterns] = useState<AIGrammarExtraction[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [selectedEiken, setSelectedEiken] = useState<EikenGrammarLevel>(null);
  const [isEikenDropdownOpen, setIsEikenDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);

  const selectedLabel = EIKEN_LEVELS.find(l => l.value === selectedEiken)?.label || 'フィルターなし';

  // Handle image selection and processing
  const handleImageSelect = async (file: File) => {
    // Check if user is authenticated (required for API)
    if (!isAuthenticated) {
      showToast({
        message: 'ログインが必要です',
        type: 'error',
        action: {
          label: 'ログイン',
          onClick: () => router.push('/login'),
        },
        duration: 4000,
      });
      return;
    }

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

      // Call grammar API (server determines isPro from authentication)
      const response = await fetch('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, eikenLevel: selectedEiken }),
      });

      const result = await response.json();

      // Handle authentication error (401)
      if (response.status === 401) {
        setProcessing(false);
        showToast({
          message: 'ログインが必要です',
          type: 'error',
          action: {
            label: 'ログイン',
            onClick: () => router.push('/login'),
          },
          duration: 4000,
        });
        return;
      }

      // Handle rate limit error (429)
      if (response.status === 429 || result.limitReached) {
        setProcessing(false);
        setShowScanLimitModal(true);
        return;
      }

      setProcessingSteps(prev =>
        prev.map(s =>
          s.id === 'ocr' ? { ...s, status: 'complete' } :
          s.id === 'analyze' ? { ...s, status: 'active' } : s
        )
      );

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

  // Save patterns to sessionStorage
  const handleSave = () => {
    setSaving(true);
    try {
      // Get existing patterns
      const existingData = sessionStorage.getItem(`grammar_patterns_${projectId}`);
      const existingPatterns: AIGrammarExtraction[] = existingData ? JSON.parse(existingData) : [];

      // Add new patterns
      const allPatterns = [...existingPatterns, ...patterns];
      sessionStorage.setItem(`grammar_patterns_${projectId}`, JSON.stringify(allPatterns));

      // Navigate to quiz page
      router.push(`/grammar/${projectId}`);
    } catch (error) {
      console.error('Failed to save patterns:', error);
    } finally {
      setSaving(false);
    }
  };

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
                onClick={() => {
                  setPatterns([]);
                  setExtractedText('');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                やり直す
              </button>
            </div>

            {patterns.map((pattern, index) => (
              <GrammarPatternCard
                key={index}
                pattern={pattern}
                isExpanded={expandedIndex === index}
                onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
              />
            ))}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? '保存中...' : '保存してクイズに進む'}
            </button>
          </div>
        )}
      </main>

      {/* Scan limit modal */}
      <ScanLimitModal
        isOpen={showScanLimitModal}
        onClose={() => setShowScanLimitModal(false)}
        todayWordsLearned={0}
      />
    </div>
  );
}
