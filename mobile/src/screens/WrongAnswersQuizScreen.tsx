import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react-native';
import { Button } from '../components/ui';
import { QuizOption } from '../components/quiz';
import colors from '../constants/colors';
import {
  getWrongAnswers,
  recordWrongAnswer,
  removeWrongAnswer,
  shuffleArray,
  type WrongAnswer,
} from '../lib/utils';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface WrongAnswerQuestion {
  item: WrongAnswer;
  options: string[];
  correctIndex: number;
}

function buildWrongAnswerQuestions(items: WrongAnswer[]): WrongAnswerQuestion[] {
  return shuffleArray(items).map((item) => {
    const pool = Array.from(
      new Set(
        [
          ...item.distractors,
          ...items
            .filter((candidate) => candidate.wordId !== item.wordId)
            .map((candidate) => candidate.japanese),
        ].filter((candidate) => candidate && candidate !== item.japanese)
      )
    );

    while (pool.length < 3) {
      pool.push(`別の意味 ${pool.length + 1}`);
    }

    const options = shuffleArray([item.japanese, ...pool.slice(0, 3)]);
    return {
      item,
      options,
      correctIndex: options.indexOf(item.japanese),
    };
  });
}

export function WrongAnswersQuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [questions, setQuestions] = useState<WrongAnswerQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  const loadQuestions = useCallback(async () => {
    setLoading(true);

    try {
      const wrongAnswers = await getWrongAnswers();
      const nextQuestions = buildWrongAnswerQuestions(wrongAnswers);

      setQuestions(nextQuestions);
      setCurrentIndex(0);
      setSelectedIndex(null);
      setRevealed(false);
      setCorrectCount(0);
      setIsComplete(false);
    } catch (error) {
      console.error('Failed to load wrong answer quiz:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadQuestions();
    }, [loadQuestions])
  );

  const currentQuestion = questions[currentIndex];

  const moveNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      return;
    }

    setCurrentIndex((value) => value + 1);
    setSelectedIndex(null);
    setRevealed(false);
  }, [currentIndex, questions.length]);

  const handleSelect = useCallback(async (index: number) => {
    if (!currentQuestion || revealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;
    if (isCorrect) {
      setCorrectCount((value) => value + 1);
      await removeWrongAnswer(currentQuestion.item.wordId);

      setTimeout(() => {
        moveNext();
      }, 450);
      return;
    }

    await recordWrongAnswer(
      currentQuestion.item.wordId,
      currentQuestion.item.english,
      currentQuestion.item.japanese,
      currentQuestion.item.projectId,
      currentQuestion.item.distractors
    );

    setQuestions((currentQuestions) =>
      currentQuestions.map((question, questionIndex) =>
        questionIndex === currentIndex
          ? {
              ...question,
              item: {
                ...question.item,
                wrongCount: question.item.wrongCount + 1,
                lastWrongAt: Date.now(),
              },
            }
          : question
      )
    );
  }, [currentIndex, currentQuestion, moveNext, revealed, selectedIndex]);

  if (loading) {
    return <View style={styles.loadingContainer} />;
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>復習する単語がありません</Text>
          <Text style={styles.emptyText}>
            通常クイズで間違えた単語がここにたまります。
          </Text>
          <Button onPress={() => navigation.goBack()}>一覧へ戻る</Button>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  if (isComplete) {
    const percentage = Math.round((correctCount / questions.length) * 100);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completeCard}>
          <View style={styles.completeIcon}>
            <Trophy size={28} color={colors.amber[600]} />
          </View>
          <Text style={styles.completeTitle}>苦手単語クイズ完了</Text>
          <Text style={styles.completeScore}>
            {correctCount} / {questions.length} 正解
          </Text>
          <Text style={styles.completeMessage}>正答率 {percentage}%</Text>
          <View style={styles.completeActions}>
            <Button
              variant="secondary"
              onPress={() => {
                void loadQuestions();
              }}
              icon={<RotateCcw size={16} color={colors.gray[800]} />}
            >
              もう一度
            </Button>
            <Button onPress={() => navigation.goBack()}>一覧へ戻る</Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const progress = (currentIndex + 1) / questions.length;
  const isCorrect = selectedIndex === currentQuestion.correctIndex;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.progressLabel}>
          {currentIndex + 1} / {questions.length}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionLabel}>英単語</Text>
        <Text style={styles.questionWord}>{currentQuestion.item.english}</Text>
        <Text style={styles.questionHint}>もっとも近い日本語訳を選んでください。</Text>
        <Text style={styles.questionMeta}>
          間違えた回数 {currentQuestion.item.wrongCount} 回
        </Text>
      </View>

      <View style={styles.optionsSection}>
        {currentQuestion.options.map((option, index) => (
          <QuizOption
            key={`${currentQuestion.item.wordId}-${option}-${index}`}
            index={index}
            label={option}
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

      {revealed && !isCorrect ? (
        <View style={styles.footer}>
          <Button onPress={moveNext}>次の問題へ</Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[700],
  },
  progressTrack: {
    height: 8,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.gray[200],
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 999,
  },
  questionCard: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 8,
  },
  questionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[500],
  },
  questionWord: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.gray[900],
  },
  questionHint: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  questionMeta: {
    fontSize: 13,
    color: colors.orange[700],
    fontWeight: '600',
  },
  optionsSection: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
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
    margin: 20,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  completeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.amber[100],
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.gray[900],
  },
  completeScore: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0d0d0d',
  },
  completeMessage: {
    fontSize: 15,
    color: colors.gray[600],
  },
  completeActions: {
    width: '100%',
    gap: 12,
    marginTop: 12,
  },
});
