import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, Flag, RotateCcw, Trophy } from 'lucide-react-native';
import { Button } from '../components/ui';
import { QuizOption } from '../components/quiz';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { useTabBar } from '../hooks/use-tab-bar';
import { getRepository } from '../lib/db';
import { buildQuizQuestions, MINIMUM_QUIZ_WORDS } from '../lib/quiz-helpers';
import { recordWrongAnswer, updateDailyStats } from '../lib/utils';
import type { QuizQuestion, RootStackParamList, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type QuizRoute = RouteProp<RootStackParamList, 'Quiz'>;

export function QuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<QuizRoute>();
  const { subscription, loading: authLoading } = useAuth();
  const { hide: hideTabBar, show: showTabBar } = useTabBar();
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  const [words, setWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const isFirstLoadRef = useRef(true);

  const loadQuiz = useCallback(async () => {
    if (authLoading) return;

    if (isFirstLoadRef.current) setLoading(true);
    try {
      const nextWords = await repository.getWords(route.params.projectId);

      if (nextWords.length < MINIMUM_QUIZ_WORDS) {
        setWords(nextWords);
        setQuestions([]);
        setLoading(false);
        return;
      }

      setWords(nextWords);
      setQuestions(buildQuizQuestions(nextWords, Math.min(nextWords.length, 10)));
      setCurrentIndex(0);
      setSelectedIndex(null);
      setRevealed(false);
      setCorrectCount(0);
      setIsComplete(false);
    } catch (error) {
      console.error('Failed to load quiz:', error);
      navigation.goBack();
    } finally {
      isFirstLoadRef.current = false;
      setLoading(false);
    }
  }, [authLoading, navigation, repository, route.params.projectId]);

  useFocusEffect(
    useCallback(() => {
      hideTabBar();
      return () => showTabBar();
    }, [hideTabBar, showTabBar])
  );

  useFocusEffect(
    useCallback(() => {
      void loadQuiz();
    }, [loadQuiz])
  );

  const currentQuestion = questions[currentIndex];

  const applyWordStatusUpdate = useCallback(
    async (question: QuizQuestion, isCorrect: boolean) => {
      const word = question.word;
      let nextStatus: Word['status'] = word.status;
      let becameMastered = false;

      if (isCorrect) {
        if (word.status === 'new') {
          nextStatus = 'review';
        } else if (word.status === 'review') {
          nextStatus = 'mastered';
          becameMastered = true;
        }
      } else if (word.status === 'mastered') {
        nextStatus = 'review';
      }

      if (nextStatus !== word.status) {
        await repository.updateWord(word.id, { status: nextStatus });

        setWords((currentWords) =>
          currentWords.map((currentWord) =>
            currentWord.id === word.id ? { ...currentWord, status: nextStatus } : currentWord
          )
        );

        setQuestions((currentQuestions) =>
          currentQuestions.map((currentQuizQuestion) =>
            currentQuizQuestion.word.id === word.id
              ? {
                  ...currentQuizQuestion,
                  word: { ...currentQuizQuestion.word, status: nextStatus },
                }
              : currentQuizQuestion
          )
        );
      }

      return { becameMastered };
    },
    [repository]
  );

  const handleToggleFavorite = useCallback(async () => {
    if (!currentQuestion) return;

    const nextFavorite = !currentQuestion.word.isFavorite;

    try {
      await repository.updateWord(currentQuestion.word.id, { isFavorite: nextFavorite });

      setWords((currentWords) =>
        currentWords.map((currentWord) =>
          currentWord.id === currentQuestion.word.id
            ? { ...currentWord, isFavorite: nextFavorite }
            : currentWord
        )
      );

      setQuestions((currentQuestions) =>
        currentQuestions.map((currentQuizQuestion, index) =>
          index === currentIndex
            ? {
                ...currentQuizQuestion,
                word: { ...currentQuizQuestion.word, isFavorite: nextFavorite },
              }
            : currentQuizQuestion
        )
      );
    } catch (error) {
      console.error('Failed to toggle favorite in quiz:', error);
    }
  }, [currentIndex, currentQuestion, repository]);

  const moveNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      return;
    }

    setCurrentIndex((value) => value + 1);
    setSelectedIndex(null);
    setRevealed(false);
  }, [currentIndex, questions.length]);

  const handleSelect = useCallback(
    async (index: number) => {
      if (!currentQuestion || revealed || selectedIndex !== null) return;

      setSelectedIndex(index);
      setRevealed(true);

      const isCorrect = index === currentQuestion.correctIndex;
      if (isCorrect) {
        setCorrectCount((value) => value + 1);
      } else {
        await recordWrongAnswer(
          currentQuestion.word.id,
          currentQuestion.word.english,
          currentQuestion.word.japanese,
          route.params.projectId,
          currentQuestion.word.distractors
        );
      }

      const { becameMastered } = await applyWordStatusUpdate(currentQuestion, isCorrect);
      await updateDailyStats(isCorrect, becameMastered);

      // No auto-advance — user taps "次へ" button for both correct and wrong
    },
    [applyWordStatusUpdate, currentQuestion, moveNext, revealed, route.params.projectId, selectedIndex]
  );

  if (loading) {
    return <View style={styles.loadingContainer} />;
  }

  if (words.length < MINIMUM_QUIZ_WORDS) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>クイズの準備がまだできていません</Text>
          <Text style={styles.emptyText}>
            4択クイズを開始するには、同じ単語帳に最低 {MINIMUM_QUIZ_WORDS} 語必要です。
          </Text>
          <Button onPress={() => navigation.goBack()}>単語帳へ戻る</Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  if (isComplete) {
    const percentage = Math.round((correctCount / questions.length) * 100);
    const wrongCount = questions.length - correctCount;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completeCard}>
          <View style={styles.completeIcon}>
            <Trophy size={28} color={colors.amber[600]} />
          </View>
          <Text style={styles.completeTitle}>クイズ完了</Text>
          <Text style={styles.completeScore}>{correctCount} / {questions.length} 正解</Text>
          <Text style={styles.completeMessage}>正答率 {percentage}% / 間違い {wrongCount}問</Text>
          <View style={styles.completeActions}>
            <Button
              variant="secondary"
              onPress={() => {
                void loadQuiz();
              }}
              icon={<RotateCcw size={16} color={colors.gray[800]} />}
            >
              もう一度
            </Button>
            <Button onPress={() => navigation.goBack()}>
              単語帳へ戻る
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const progress = (currentIndex + 1) / questions.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar: X button + progress bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <X size={20} color={colors.gray[700]} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{currentIndex + 1}/{questions.length}</Text>
      </View>

      {/* Word display — no border */}
      <View style={styles.questionArea}>
        <Text style={styles.questionWord}>{currentQuestion.word.english}</Text>
        <TouchableOpacity style={styles.flagButton} onPress={() => void handleToggleFavorite()}>
          <Flag
            size={18}
            color={currentQuestion.word.isFavorite ? colors.orange[600] : colors.gray[400]}
            fill={currentQuestion.word.isFavorite ? colors.orange[600] : 'transparent'}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.optionsList}>
        {currentQuestion.options.map((option, index) => (
          <QuizOption
            key={`${currentQuestion.word.id}-${option}-${index}`}
            label={option}
            index={index}
            isSelected={selectedIndex === index}
            isCorrect={index === currentQuestion.correctIndex}
            isRevealed={revealed}
            onSelect={() => {
              void handleSelect(index);
            }}
            disabled={revealed}
          />
        ))}
      </View>

      {/* Example sentence — shown after answer */}
      {revealed && currentQuestion.word.exampleSentence ? (
        <View style={styles.exampleCard}>
          <Text style={styles.exampleText}>{currentQuestion.word.exampleSentence}</Text>
          {currentQuestion.word.exampleSentenceJa ? (
            <Text style={styles.exampleJa}>{currentQuestion.word.exampleSentenceJa}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Next button — always shown after answering */}
      {revealed ? (
        <View style={styles.footer}>
          {selectedIndex !== currentQuestion.correctIndex ? (
            <Text style={styles.answerHint}>
              正解は「{currentQuestion.options[currentQuestion.correctIndex]}」です。
            </Text>
          ) : null}
          <Button onPress={moveNext}>次へ</Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.gray[200],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.gray[900],
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
    fontVariant: ['tabular-nums' as const],
    minWidth: 32,
    textAlign: 'right',
  },
  questionArea: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 10,
    gap: 10,
  },
  questionWord: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  flagButton: {
    padding: 6,
  },
  optionsList: {
    gap: 8,
  },
  exampleCard: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.gray[50],
    borderRadius: 14,
    gap: 4,
  },
  exampleText: {
    fontSize: 14,
    color: colors.gray[800],
    lineHeight: 20,
  },
  exampleJa: {
    fontSize: 13,
    color: colors.gray[500],
    lineHeight: 18,
  },
  footer: {
    marginTop: 'auto',
    gap: 12,
    paddingTop: 20,
  },
  answerHint: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
    textAlign: 'center',
  },
  completeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 28,
    gap: 14,
  },
  completeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber[50],
  },
  completeTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.gray[900],
  },
  completeScore: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
  },
  completeMessage: {
    fontSize: 15,
    color: colors.gray[600],
  },
  completeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
