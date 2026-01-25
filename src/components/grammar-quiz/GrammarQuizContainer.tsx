'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import type { AIGrammarQuizQuestion, GrammarQuizType } from '@/types';
import { ProgressBar } from './ProgressBar';
import { QuestionDisplay } from './QuestionDisplay';
import { AnswerArea, AnswerAreaState } from './AnswerArea';
import { WordPool } from './WordPool';
import { WordButton, WordButtonState } from './WordButton';
import { FeedbackPanel } from './FeedbackPanel';
import { ActionButton } from './ActionButton';

interface GrammarQuizContainerProps {
  question: AIGrammarQuizQuestion;
  patternName: string;
  currentQuestionNumber: number;
  totalQuestions: number;
  onAnswer: (isCorrect: boolean) => void;
  onNext: () => void;
  onExit: () => void;
}

export function GrammarQuizContainer({
  question,
  patternName,
  currentQuestionNumber,
  totalQuestions,
  onAnswer,
  onNext,
  onExit,
}: GrammarQuizContainerProps) {
  // State
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Prepare word pool based on question type
  const wordPool = useMemo(() => {
    if (question.questionType === 'single_select') {
      return question.wordOptions?.map((opt) => opt.word) || [];
    }
    if (question.questionType === 'word_tap') {
      return question.wordOptions?.map((opt) => opt.word) || [];
    }
    if (question.questionType === 'sentence_build') {
      const words = [...(question.sentenceWords || [])];
      if (question.extraWords) {
        words.push(...question.extraWords);
      }
      // Shuffle
      return words.sort(() => Math.random() - 0.5);
    }
    return [];
  }, [question]);

  // Handle word selection (Word Tap / Sentence Build)
  const handleWordSelect = useCallback((word: string) => {
    if (showResult) return;
    setSelectedWords((prev) => [...prev, word]);
  }, [showResult]);

  // Handle word removal from answer area
  const handleWordRemove = useCallback((word: string, index: number) => {
    if (showResult) return;
    setSelectedWords((prev) => prev.filter((_, i) => i !== index));
  }, [showResult]);

  // Handle single select option
  const handleOptionSelect = useCallback((option: string) => {
    if (showResult) return;
    setSelectedOption((prev) => (prev === option ? null : option));
  }, [showResult]);

  // Get user's answer string
  const getUserAnswer = (): string => {
    if (question.questionType === 'single_select') {
      return selectedOption || '';
    }
    if (question.questionType === 'word_tap') {
      return selectedWords.join(' ');
    }
    if (question.questionType === 'sentence_build') {
      return selectedWords.join(' ');
    }
    return '';
  };

  // Check if answer is correct
  const checkAnswer = (): boolean => {
    const userAnswer = getUserAnswer().toLowerCase().trim();

    if (question.questionType === 'sentence_build') {
      const correctSentence = question.sentenceWords?.join(' ').toLowerCase().trim();
      return userAnswer === correctSentence;
    }

    return userAnswer === question.correctAnswer.toLowerCase().trim();
  };

  // Handle submit
  const handleSubmit = () => {
    if (showResult) return;

    const correct = checkAnswer();
    setIsCorrect(correct);
    setShowResult(true);
    onAnswer(correct);
  };

  // Handle next question
  const handleNext = () => {
    setSelectedWords([]);
    setSelectedOption(null);
    setShowResult(false);
    setIsCorrect(false);
    onNext();
  };

  // Check if can submit
  const canSubmit = () => {
    if (question.questionType === 'single_select') {
      return selectedOption !== null;
    }
    if (question.questionType === 'word_tap') {
      return selectedWords.length > 0;
    }
    if (question.questionType === 'sentence_build') {
      // All words must be placed (excluding extra distractor words)
      const requiredCount = question.sentenceWords?.length || 0;
      return selectedWords.length >= requiredCount;
    }
    return false;
  };

  // Get answer area state
  const getAnswerAreaState = (): AnswerAreaState => {
    if (!showResult) {
      return selectedWords.length > 0 ? 'filled' : 'empty';
    }
    return isCorrect ? 'correct' : 'incorrect';
  };

  // Get single select option state
  const getOptionState = (option: string): WordButtonState => {
    if (showResult) {
      if (option === question.correctAnswer) {
        return 'correct';
      }
      if (option === selectedOption && !isCorrect) {
        return 'incorrect';
      }
      return 'disabled';
    }
    if (option === selectedOption) {
      return 'selected';
    }
    return 'default';
  };

  // Render question type specific UI
  const renderQuestionUI = () => {
    switch (question.questionType) {
      case 'single_select':
        return (
          <div className="grid grid-cols-2 gap-3 px-4">
            {wordPool.map((option, index) => (
              <WordButton
                key={`${option}-${index}`}
                word={option}
                state={getOptionState(option)}
                onClick={() => handleOptionSelect(option)}
                disabled={showResult}
                showIcon={showResult}
                className="w-full justify-center"
              />
            ))}
          </div>
        );

      case 'word_tap':
      case 'sentence_build':
        return (
          <>
            {/* Answer Area */}
            <div className="px-4">
              <AnswerArea
                selectedWords={selectedWords}
                onWordRemove={handleWordRemove}
                state={getAnswerAreaState()}
                placeholder={
                  question.questionType === 'word_tap'
                    ? 'タップして単語を選択'
                    : '単語をタップして文を作成'
                }
                disabled={showResult}
                correctAnswer={
                  question.questionType === 'sentence_build'
                    ? question.sentenceWords
                    : question.correctAnswer
                }
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 my-4" />

            {/* Word Pool */}
            <WordPool
              words={wordPool}
              selectedWords={selectedWords}
              onWordSelect={handleWordSelect}
              disabled={showResult}
              correctAnswer={
                question.questionType === 'sentence_build'
                  ? question.sentenceWords
                  : question.correctAnswer
              }
              showResult={showResult && !isCorrect}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="font-semibold text-gray-900 truncate">
                {patternName}
              </h1>
              <p className="text-sm text-gray-500">
                問題 {currentQuestionNumber} / {totalQuestions}
              </p>
            </div>
          </div>
        </div>
        <ProgressBar current={currentQuestionNumber} total={totalQuestions} />
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full py-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={`question-${currentQuestionNumber}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Question */}
            <div className="px-4 mb-6">
              <QuestionDisplay
                question={question.question}
                questionJa={question.questionJa}
              />
            </div>

            {/* Question-specific UI */}
            {renderQuestionUI()}

            {/* Feedback Panel */}
            {showResult && (
              <div className="px-4 mt-6">
                <FeedbackPanel
                  isCorrect={isCorrect}
                  correctAnswer={
                    question.questionType === 'sentence_build'
                      ? question.sentenceWords?.join(' ') || ''
                      : question.correctAnswer
                  }
                  userAnswer={getUserAnswer()}
                  explanation={question.explanation}
                  grammarPoint={question.grammarPoint}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Action button */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-4 safe-area-bottom">
        <div className="max-w-lg mx-auto">
          {!showResult ? (
            <ActionButton
              label="回答する"
              onClick={handleSubmit}
              disabled={!canSubmit()}
              variant="primary"
            />
          ) : (
            <ActionButton
              label={currentQuestionNumber < totalQuestions ? '次へ' : '完了'}
              onClick={handleNext}
              variant={isCorrect ? 'success' : 'neutral'}
              showNextIcon={currentQuestionNumber < totalQuestions}
              showCheckIcon={currentQuestionNumber >= totalQuestions}
            />
          )}
        </div>
      </div>
    </div>
  );
}
