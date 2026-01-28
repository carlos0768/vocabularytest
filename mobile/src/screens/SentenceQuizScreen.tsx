import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  X,
  ChevronRight,
  Trophy,
  RotateCcw,
  BookText,
  AlertCircle,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { shuffleArray, recordWrongAnswer, recordActivity } from '../lib/utils';
import { supabase } from '../lib/supabase';
import colors from '../constants/colors';
import type {
  RootStackParamList,
  Word,
  SentenceQuizQuestion,
  MultiFillInBlankQuestion,
  FillInBlankQuestion,
  WordOrderQuestion,
  EnhancedBlankSlot,
  WordStatus,
} from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Grammar'>;

const QUIZ_SIZE = 15;
const MIN_WORDS_REQUIRED = 10;
const API_URL = 'https://vocabularytest-omega.vercel.app/api/sentence-quiz';

export function SentenceQuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { projectId } = route.params;
  const { subscription, loading: authLoading, user, session } = useAuth();

  const [allWords, setAllWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<SentenceQuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Generate questions from API
  const generateQuestions = useCallback(async (words: Word[], authSession: typeof session) => {
    setGenerating(true);
    setError(null);

    try {
      // Select 15 words (or duplicate if less)
      let selectedWords: Word[] = [];

      if (words.length >= QUIZ_SIZE) {
        selectedWords = shuffleArray(words).slice(0, QUIZ_SIZE);
      } else {
        const shuffled = shuffleArray(words);
        while (selectedWords.length < QUIZ_SIZE) {
          selectedWords.push(...shuffled);
        }
        selectedWords = selectedWords.slice(0, QUIZ_SIZE);
        selectedWords = shuffleArray(selectedWords);
      }

      // Get session - try multiple methods
      let accessToken: string | null = null;

      // Method 1: Use session from hook
      if (authSession?.access_token) {
        accessToken = authSession.access_token;
        console.log('Using session from hook');
      }

      // Method 2: Get fresh session
      if (!accessToken) {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (freshSession?.access_token) {
          accessToken = freshSession.access_token;
          console.log('Using fresh session');
        }
      }

      // Method 3: Get user and try to refresh
      if (!accessToken) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
          if (refreshedSession?.access_token) {
            accessToken = refreshedSession.access_token;
            console.log('Using refreshed session');
          }
        }
      }

      if (!accessToken) {
        console.error('No access token found');
        throw new Error('認証が必要です。ログインしてください。');
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          words: selectedWords.map((w) => ({
            id: w.id,
            english: w.english,
            japanese: w.japanese,
            status: w.status,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '問題の生成に失敗しました');
      }

      setQuestions(data.questions);
      setCurrentIndex(0);
      setResults({ correct: 0, total: 0 });
      setIsComplete(false);
    } catch (err) {
      console.error('Failed to generate questions:', err);
      setError(err instanceof Error ? err.message : '問題の生成に失敗しました');
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (authLoading) return;

    // Pro-only check
    if (subscription?.status !== 'active') {
      setError('例文クイズはProプラン限定機能です');
      setLoading(false);
      return;
    }

    const loadWords = async () => {
      try {
        const words = await repository.getWords(projectId);
        if (words.length < MIN_WORDS_REQUIRED) {
          setError(`例文クイズには最低${MIN_WORDS_REQUIRED}単語が必要です（現在: ${words.length}単語）`);
          setLoading(false);
          return;
        }
        setAllWords(words);
        await generateQuestions(words, session);
      } catch (error) {
        console.error('Failed to load words:', error);
        navigation.goBack();
      }
    };

    loadWords();
  }, [projectId, repository, navigation, generateQuestions, authLoading, subscription?.status, session]);

  // Handle answer
  const handleAnswer = async (isCorrect: boolean) => {
    const currentQuestion = questions[currentIndex];

    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Record activity
    if (!isCorrect) {
      recordWrongAnswer(
        currentQuestion.wordId,
        currentQuestion.targetWord,
        currentQuestion.japaneseMeaning,
        projectId,
        []
      );
    }
    recordActivity();

    // Update word status
    try {
      const word = allWords.find((w) => w.id === currentQuestion.wordId);
      if (word) {
        let newStatus: WordStatus = word.status;
        if (isCorrect) {
          if (word.status === 'new') newStatus = 'review';
          else if (word.status === 'review') newStatus = 'mastered';
        } else {
          if (word.status === 'mastered') newStatus = 'review';
          else if (word.status === 'review') newStatus = 'new';
        }

        if (newStatus !== word.status) {
          await repository.updateWord(word.id, { status: newStatus });
          setAllWords((prev) =>
            prev.map((w) =>
              w.id === word.id ? { ...w, status: newStatus } : w
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to update word status:', error);
    }

    // Move to next
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // Restart
  const handleRestart = async () => {
    setLoading(true);
    await generateQuestions(allWords, session);
  };

  // Go back
  const handleGoBack = () => {
    navigation.goBack();
  };

  // Loading
  if (loading || generating) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple[600]} />
          <Text style={styles.loadingText}>
            {generating ? '問題を生成中...' : '読み込み中...'}
          </Text>
          {generating && (
            <Text style={styles.loadingSubtext}>
              AIが例文を作成しています
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Error
  if (error) {
    const canRetry = allWords.length >= MIN_WORDS_REQUIRED;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
            <X size={24} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <AlertCircle size={40} color={colors.red[500]} />
          </View>
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            {canRetry && (
              <Button
                onPress={() => generateQuestions(allWords)}
                size="lg"
                style={styles.retryButton}
              >
                再試行
              </Button>
            )}
            <Button
              variant="secondary"
              onPress={handleGoBack}
              size="lg"
            >
              戻る
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Complete
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
            <X size={24} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>
        <View style={styles.resultContainer}>
          <View style={styles.resultCard}>
            <View style={styles.trophyIcon}>
              <Trophy size={40} color={colors.yellow[600]} />
            </View>
            <Text style={styles.resultTitle}>クイズ完了!</Text>
            <Text style={styles.resultPercentage}>{percentage}%</Text>
            <Text style={styles.resultScore}>
              {results.total}問中 {results.correct}問正解
            </Text>
            <View style={styles.resultActions}>
              <Button
                onPress={handleRestart}
                size="lg"
                icon={<RotateCcw size={20} color={colors.white} />}
                style={styles.resultButton}
              >
                もう一度
              </Button>
              <Button
                variant="secondary"
                onPress={handleGoBack}
                size="lg"
                style={styles.resultButton}
              >
                戻る
              </Button>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // No questions
  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
            <X size={24} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>問題がありません</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with progress */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.closeButton}>
          <X size={24} color={colors.gray[600]} />
        </TouchableOpacity>
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {questions.length}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentIndex + 1) / questions.length) * 100}%` },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Question content */}
      <View style={styles.questionContainer}>
        {currentQuestion.type === 'multi-fill-in-blank' ? (
          <MultiFillInBlankQuestionView
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        ) : currentQuestion.type === 'fill-in-blank' ? (
          <FillInBlankQuestionView
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        ) : (
          <WordOrderQuestionView
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// Multi Fill-in-blank Question Component
interface MultiFillInBlankProps {
  question: MultiFillInBlankQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

function MultiFillInBlankQuestionView({ question, onAnswer }: MultiFillInBlankProps) {
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string | null>>({});
  const [currentBlankIndex, setCurrentBlankIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [blankResults, setBlankResults] = useState<Record<number, boolean>>({});

  const blanks = question.blanks;

  // All options merged and shuffled
  const allOptions = useMemo(() => {
    const options = blanks.flatMap(blank => blank.options);
    const uniqueOptions = [...new Set(options)];
    return shuffleArray(uniqueOptions);
  }, [blanks]);

  const allBlanksFilled = blanks.every((_, idx) => selectedOptions[idx] !== null && selectedOptions[idx] !== undefined);

  const usedOptions = useMemo(() => {
    return new Set(Object.values(selectedOptions).filter(Boolean));
  }, [selectedOptions]);

  const handleSelectOption = (option: string) => {
    if (isRevealed) return;
    if (usedOptions.has(option)) return;

    setSelectedOptions(prev => ({
      ...prev,
      [currentBlankIndex]: option,
    }));

    // Auto move to next blank
    const nextEmptyIndex = blanks.findIndex((_, idx) =>
      idx > currentBlankIndex && selectedOptions[idx] === undefined
    );
    if (nextEmptyIndex !== -1) {
      setTimeout(() => setCurrentBlankIndex(nextEmptyIndex), 300);
    } else {
      const prevEmptyIndex = blanks.findIndex((_, idx) =>
        idx < currentBlankIndex && selectedOptions[idx] === undefined
      );
      if (prevEmptyIndex !== -1) {
        setTimeout(() => setCurrentBlankIndex(prevEmptyIndex), 300);
      }
    }
  };

  const handleSubmit = () => {
    if (!allBlanksFilled) return;

    const results: Record<number, boolean> = {};
    let allCorrect = true;

    blanks.forEach((blank, idx) => {
      const isBlankCorrect = selectedOptions[idx] === blank.correctAnswer;
      results[idx] = isBlankCorrect;
      if (!isBlankCorrect) allCorrect = false;
    });

    setBlankResults(results);
    setIsCorrect(allCorrect);
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  const handleBlankClick = (index: number) => {
    if (isRevealed) return;
    if (selectedOptions[index] !== null && selectedOptions[index] !== undefined) {
      setSelectedOptions(prev => {
        const newOptions = { ...prev };
        delete newOptions[index];
        return newOptions;
      });
    }
    setCurrentBlankIndex(index);
  };

  // Render sentence with blanks
  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <View style={styles.sentenceContainer}>
        {parts.map((part, index) => (
          <View key={index} style={styles.sentencePart}>
            <Text style={styles.sentenceText}>{part}</Text>
            {index < blanks.length && (
              <TouchableOpacity
                onPress={() => handleBlankClick(index)}
                style={[
                  styles.blankButton,
                  isRevealed
                    ? blankResults[index]
                      ? styles.blankCorrect
                      : styles.blankWrong
                    : currentBlankIndex === index
                    ? styles.blankActive
                    : selectedOptions[index]
                    ? styles.blankFilled
                    : styles.blankEmpty,
                ]}
              >
                {isRevealed && !blankResults[index] ? (
                  <View style={styles.blankAnswerContainer}>
                    <Text style={[styles.blankText, styles.blankTextWrong]}>
                      {selectedOptions[index]}
                    </Text>
                    <Text style={[styles.blankText, styles.blankTextCorrect]}>
                      {blanks[index].correctAnswer}
                    </Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.blankText,
                    selectedOptions[index] ? styles.blankTextFilled : styles.blankTextEmpty,
                  ]}>
                    {selectedOptions[index] || '?'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.questionScroll} contentContainerStyle={styles.questionContent}>
      {/* Japanese meaning */}
      <View style={styles.japaneseMeaningBox}>
        <Text style={styles.japaneseMeaningText}>{question.japaneseMeaning}</Text>
      </View>

      {/* Sentence with blanks */}
      {renderSentence()}

      {/* Current blank hint */}
      {!isRevealed && (
        <Text style={styles.blankHint}>
          空欄 {currentBlankIndex + 1} を選択中（タップして別の空欄を選択）
        </Text>
      )}

      {/* Options */}
      <View style={styles.optionsGrid}>
        {allOptions.map((option) => {
          const isUsed = usedOptions.has(option);
          const isCorrectAnswer = isRevealed && blanks.some(b => b.correctAnswer === option);
          const isWronglyUsed = isRevealed && isUsed && blanks.some((b, idx) =>
            selectedOptions[idx] === option && b.correctAnswer !== option
          );

          return (
            <TouchableOpacity
              key={option}
              onPress={() => handleSelectOption(option)}
              disabled={isRevealed || isUsed}
              style={[
                styles.optionButton,
                isRevealed
                  ? isCorrectAnswer
                    ? styles.optionCorrect
                    : isWronglyUsed
                    ? styles.optionWrong
                    : styles.optionNeutral
                  : isUsed
                  ? styles.optionUsed
                  : styles.optionDefault,
              ]}
            >
              <Text style={[
                styles.optionText,
                isRevealed
                  ? isCorrectAnswer
                    ? styles.optionTextCorrect
                    : isWronglyUsed
                    ? styles.optionTextWrong
                    : styles.optionTextNeutral
                  : isUsed
                  ? styles.optionTextUsed
                  : styles.optionTextDefault,
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Submit/Next button */}
      {!isRevealed ? (
        <Button
          onPress={handleSubmit}
          disabled={!allBlanksFilled}
          size="lg"
          style={styles.submitButton}
        >
          回答する
        </Button>
      ) : (
        <View style={styles.feedbackContainer}>
          <View style={[
            styles.feedbackBox,
            isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
          ]}>
            <Text style={[
              styles.feedbackText,
              isCorrect ? styles.feedbackTextCorrect : styles.feedbackTextWrong,
            ]}>
              {isCorrect
                ? '正解!'
                : `${Object.values(blankResults).filter(Boolean).length}/${blanks.length}正解`}
            </Text>
          </View>
          <Button
            onPress={handleNext}
            size="lg"
            icon={<ChevronRight size={20} color={colors.white} />}
            style={styles.nextButton}
          >
            次へ
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

// Simple Fill-in-blank (single blank)
interface FillInBlankProps {
  question: FillInBlankQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

function FillInBlankQuestionView({ question, onAnswer }: FillInBlankProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const blank = question.blanks[0];
  const isCorrect = selectedAnswer === blank.correctAnswer;

  const handleSelect = (option: string) => {
    if (isRevealed) return;
    setSelectedAnswer(option);
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <View style={styles.sentenceContainer}>
        {parts.map((part, index) => (
          <View key={index} style={styles.sentencePart}>
            <Text style={styles.sentenceText}>{part}</Text>
            {index < question.blanks.length && (
              <View style={[
                styles.blankButton,
                isRevealed
                  ? isCorrect ? styles.blankCorrect : styles.blankWrong
                  : styles.blankEmpty,
              ]}>
                {isRevealed && !isCorrect ? (
                  <View style={styles.blankAnswerContainer}>
                    <Text style={[styles.blankText, styles.blankTextWrong]}>
                      {selectedAnswer}
                    </Text>
                    <Text style={[styles.blankText, styles.blankTextCorrect]}>
                      {blank.correctAnswer}
                    </Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.blankText,
                    selectedAnswer ? styles.blankTextFilled : styles.blankTextEmpty,
                  ]}>
                    {selectedAnswer || '?'}
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.questionScroll} contentContainerStyle={styles.questionContent}>
      <View style={styles.japaneseMeaningBox}>
        <Text style={styles.japaneseMeaningText}>{question.japaneseMeaning}</Text>
      </View>

      {renderSentence()}

      <View style={styles.optionsGrid}>
        {blank.options.map((option) => {
          const isSelected = selectedAnswer === option;
          const isThisCorrect = option === blank.correctAnswer;

          return (
            <TouchableOpacity
              key={option}
              onPress={() => handleSelect(option)}
              disabled={isRevealed}
              style={[
                styles.optionButton,
                isRevealed
                  ? isThisCorrect
                    ? styles.optionCorrect
                    : isSelected
                    ? styles.optionWrong
                    : styles.optionNeutral
                  : styles.optionDefault,
              ]}
            >
              <Text style={[
                styles.optionText,
                isRevealed
                  ? isThisCorrect
                    ? styles.optionTextCorrect
                    : isSelected
                    ? styles.optionTextWrong
                    : styles.optionTextNeutral
                  : styles.optionTextDefault,
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isRevealed && (
        <View style={styles.feedbackContainer}>
          <View style={[
            styles.feedbackBox,
            isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
          ]}>
            <Text style={[
              styles.feedbackText,
              isCorrect ? styles.feedbackTextCorrect : styles.feedbackTextWrong,
            ]}>
              {isCorrect ? '正解!' : '不正解'}
            </Text>
          </View>
          <Button
            onPress={handleNext}
            size="lg"
            icon={<ChevronRight size={20} color={colors.white} />}
            style={styles.nextButton}
          >
            次へ
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

// Word Order Question
interface WordOrderProps {
  question: WordOrderQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

function WordOrderQuestionView({ question, onAnswer }: WordOrderProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [isRevealed, setIsRevealed] = useState(false);

  const availableWords = question.shuffledWords.filter(
    word => !selectedWords.includes(word)
  );

  const isCorrect = selectedWords.join(' ') === question.correctOrder.join(' ');

  const handleSelectWord = (word: string) => {
    if (isRevealed) return;
    setSelectedWords(prev => [...prev, word]);
  };

  const handleRemoveWord = (index: number) => {
    if (isRevealed) return;
    setSelectedWords(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  return (
    <ScrollView style={styles.questionScroll} contentContainerStyle={styles.questionContent}>
      <View style={styles.japaneseMeaningBox}>
        <Text style={styles.japaneseMeaningText}>{question.japaneseMeaning}</Text>
      </View>

      {/* Selected words area */}
      <View style={styles.wordOrderArea}>
        {selectedWords.length === 0 ? (
          <Text style={styles.wordOrderPlaceholder}>
            下の単語をタップして文を作成
          </Text>
        ) : (
          <View style={styles.selectedWordsContainer}>
            {selectedWords.map((word, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleRemoveWord(index)}
                disabled={isRevealed}
                style={[
                  styles.selectedWordButton,
                  isRevealed && !isCorrect && styles.selectedWordWrong,
                  isRevealed && isCorrect && styles.selectedWordCorrect,
                ]}
              >
                <Text style={styles.selectedWordText}>{word}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Show correct order if wrong */}
      {isRevealed && !isCorrect && (
        <View style={styles.correctOrderBox}>
          <Text style={styles.correctOrderLabel}>正解:</Text>
          <Text style={styles.correctOrderText}>
            {question.correctOrder.join(' ')}
          </Text>
        </View>
      )}

      {/* Available words */}
      <View style={styles.availableWordsContainer}>
        {availableWords.map((word, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => handleSelectWord(word)}
            disabled={isRevealed}
            style={styles.availableWordButton}
          >
            <Text style={styles.availableWordText}>{word}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Submit/Next */}
      {!isRevealed ? (
        <Button
          onPress={handleSubmit}
          disabled={selectedWords.length !== question.correctOrder.length}
          size="lg"
          style={styles.submitButton}
        >
          回答する
        </Button>
      ) : (
        <View style={styles.feedbackContainer}>
          <View style={[
            styles.feedbackBox,
            isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
          ]}>
            <Text style={[
              styles.feedbackText,
              isCorrect ? styles.feedbackTextCorrect : styles.feedbackTextWrong,
            ]}>
              {isCorrect ? '正解!' : '不正解'}
            </Text>
          </View>
          <Button
            onPress={handleNext}
            size="lg"
            icon={<ChevronRight size={20} color={colors.white} />}
            style={styles.nextButton}
          >
            次へ
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[700],
  },
  loadingSubtext: {
    fontSize: 14,
    color: colors.gray[500],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  closeButton: {
    padding: 8,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  progressBar: {
    width: 96,
    height: 8,
    backgroundColor: colors.gray[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.purple[600],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.red[600],
    textAlign: 'center',
    marginBottom: 24,
  },
  errorActions: {
    gap: 12,
    width: '100%',
    maxWidth: 200,
  },
  retryButton: {
    marginBottom: 8,
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
  },
  trophyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.yellow[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 16,
  },
  resultPercentage: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.purple[600],
  },
  resultScore: {
    fontSize: 16,
    color: colors.gray[500],
    marginBottom: 24,
  },
  resultActions: {
    width: '100%',
    gap: 12,
  },
  resultButton: {
    width: '100%',
  },
  questionContainer: {
    flex: 1,
  },
  questionScroll: {
    flex: 1,
  },
  questionContent: {
    padding: 16,
    paddingBottom: 40,
  },
  japaneseMeaningBox: {
    backgroundColor: colors.purple[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  japaneseMeaningText: {
    fontSize: 15,
    color: colors.purple[700],
    fontWeight: '500',
    lineHeight: 22,
  },
  sentenceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 4,
  },
  sentencePart: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sentenceText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.gray[900],
  },
  blankButton: {
    minWidth: 80,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 4,
    borderWidth: 2,
  },
  blankEmpty: {
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },
  blankActive: {
    backgroundColor: colors.purple[100],
    borderColor: colors.purple[400],
  },
  blankFilled: {
    backgroundColor: colors.purple[600],
    borderColor: colors.purple[600],
  },
  blankCorrect: {
    backgroundColor: colors.emerald[100],
    borderColor: colors.emerald[400],
  },
  blankWrong: {
    backgroundColor: colors.red[100],
    borderColor: colors.red[400],
  },
  blankText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  blankTextEmpty: {
    color: colors.gray[400],
  },
  blankTextFilled: {
    color: colors.white,
  },
  blankTextCorrect: {
    color: colors.emerald[700],
  },
  blankTextWrong: {
    color: colors.red[700],
    textDecorationLine: 'line-through',
  },
  blankAnswerContainer: {
    alignItems: 'center',
  },
  blankHint: {
    fontSize: 12,
    color: colors.gray[500],
    textAlign: 'center',
    marginBottom: 20,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
  },
  optionDefault: {
    backgroundColor: colors.white,
    borderColor: colors.gray[300],
  },
  optionUsed: {
    backgroundColor: colors.gray[200],
    borderColor: colors.gray[200],
  },
  optionCorrect: {
    backgroundColor: colors.emerald[100],
    borderColor: colors.emerald[400],
  },
  optionWrong: {
    backgroundColor: colors.red[100],
    borderColor: colors.red[400],
  },
  optionNeutral: {
    backgroundColor: colors.white,
    borderColor: colors.gray[200],
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextDefault: {
    color: colors.gray[700],
  },
  optionTextUsed: {
    color: colors.gray[400],
  },
  optionTextCorrect: {
    color: colors.emerald[700],
  },
  optionTextWrong: {
    color: colors.red[700],
  },
  optionTextNeutral: {
    color: colors.gray[400],
  },
  submitButton: {
    marginTop: 8,
  },
  feedbackContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  feedbackBox: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  feedbackCorrect: {
    backgroundColor: colors.emerald[100],
  },
  feedbackWrong: {
    backgroundColor: colors.red[100],
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackTextCorrect: {
    color: colors.emerald[700],
  },
  feedbackTextWrong: {
    color: colors.red[700],
  },
  nextButton: {
    flex: 1,
  },
  // Word order styles
  wordOrderArea: {
    minHeight: 100,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gray[200],
    borderStyle: 'dashed',
    padding: 16,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordOrderPlaceholder: {
    fontSize: 14,
    color: colors.gray[400],
  },
  selectedWordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  selectedWordButton: {
    backgroundColor: colors.purple[600],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  selectedWordText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
  },
  selectedWordWrong: {
    backgroundColor: colors.red[500],
  },
  selectedWordCorrect: {
    backgroundColor: colors.emerald[500],
  },
  correctOrderBox: {
    backgroundColor: colors.emerald[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  correctOrderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.emerald[700],
    marginBottom: 4,
  },
  correctOrderText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.emerald[800],
  },
  availableWordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  availableWordButton: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gray[300],
  },
  availableWordText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray[700],
  },
});
