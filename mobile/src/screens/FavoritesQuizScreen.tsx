import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, Flag, ChevronRight, RotateCcw, Trophy } from 'lucide-react-native';
import { QuizOption } from '../components/quiz';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { getGuestUserId, shuffleArray, updateDailyStats } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word, QuizQuestion } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function FavoritesQuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [quizComplete, setQuizComplete] = useState(false);

  const repository = getRepository(isAuthenticated ? 'active' : 'free');

  // Generate quiz questions from favorite words
  const generateQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    return words.map((word) => {
      const options = shuffleArray([word.japanese, ...word.distractors]);
      const correctIndex = options.indexOf(word.japanese);
      return { word, options, correctIndex };
    });
  }, []);

  // Load favorite words
  const loadFavorites = useCallback(async () => {
    if (authLoading) return;

    try {
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const projects = await repository.getProjects(userId);

      const allFavorites: Word[] = [];
      for (const project of projects) {
        const projectWords = await repository.getWords(project.id);
        const favorites = projectWords.filter((w) => w.isFavorite);
        allFavorites.push(...favorites);
      }

      if (allFavorites.length < 4) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
        return;
      }

      const shuffled = shuffleArray(allFavorites);
      const quizQuestions = generateQuestions(shuffled);
      setQuestions(quizQuestions);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Main');
      }
    } finally {
      setLoading(false);
    }
  }, [repository, navigation, generateQuestions, authLoading, isAuthenticated, user]);

  useEffect(() => {
    if (!authLoading) {
      loadFavorites();
    }
  }, [loadFavorites, authLoading]);

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = async (index: number) => {
    if (showResult) return;

    setSelectedIndex(index);
    setShowResult(true);

    const isCorrect = index === currentQuestion.correctIndex;
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    }

    // Record answer for daily stats
    await updateDailyStats(isCorrect, false);

    // Auto-advance if correct
    if (isCorrect) {
      setTimeout(() => {
        handleNext();
      }, 500);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setShowResult(false);
    } else {
      setQuizComplete(true);
    }
  };

  const handleRetry = () => {
    const shuffled = shuffleArray(questions.map((q) => q.word));
    const newQuestions = generateQuestions(shuffled);
    setQuestions(newQuestions);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setShowResult(false);
    setCorrectCount(0);
    setQuizComplete(false);
  };

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>苦手単語クイズを準備中...</Text>
      </View>
    );
  }

  // Quiz complete screen
  if (quizComplete) {
    const accuracy = Math.round((correctCount / questions.length) * 100);

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.completeContainer}>
          <View style={styles.trophyContainer}>
            <Trophy size={48} color={colors.amber[500]} />
          </View>
          <Text style={styles.completeTitle}>苦手単語クイズ完了！</Text>
          <View style={styles.resultStats}>
            <View style={styles.resultStatItem}>
              <Text style={styles.resultStatValue}>{correctCount}</Text>
              <Text style={styles.resultStatLabel}>正解</Text>
            </View>
            <View style={styles.resultStatDivider} />
            <View style={styles.resultStatItem}>
              <Text style={styles.resultStatValue}>{questions.length}</Text>
              <Text style={styles.resultStatLabel}>問題数</Text>
            </View>
            <View style={styles.resultStatDivider} />
            <View style={styles.resultStatItem}>
              <Text style={[styles.resultStatValue, { color: colors.primary[600] }]}>
                {accuracy}%
              </Text>
              <Text style={styles.resultStatLabel}>正答率</Text>
            </View>
          </View>
          <View style={styles.completeActions}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
            >
              <RotateCcw size={20} color={colors.primary[600]} />
              <Text style={styles.retryButtonText}>もう一度</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleClose}
            >
              <Text style={styles.doneButtonText}>完了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <X size={24} color={colors.gray[600]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Flag size={16} color={colors.orange[500]} />
          <Text style={styles.progress}>
            {currentIndex + 1} / {questions.length}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${((currentIndex + 1) / questions.length) * 100}%` },
          ]}
        />
      </View>

      {/* Question */}
      <View style={styles.questionContainer}>
        <Text style={styles.questionLabel}>この単語の意味は？</Text>
        <Text style={styles.questionWord}>{currentQuestion?.word.english}</Text>
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {currentQuestion?.options.map((option, index) => (
          <QuizOption
            key={index}
            label={option}
            index={index}
            isSelected={selectedIndex === index}
            isCorrect={index === currentQuestion.correctIndex}
            isRevealed={showResult}
            onSelect={() => handleSelectOption(index)}
            disabled={showResult}
          />
        ))}
      </View>

      {/* Next button */}
      {showResult && selectedIndex !== currentQuestion?.correctIndex && (
        <View style={styles.nextButtonContainer}>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>
              {currentIndex < questions.length - 1 ? '次へ' : '結果を見る'}
            </Text>
            <ChevronRight size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.gray[600],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progress: {
    fontSize: 14,
    color: colors.gray[500],
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.gray[100],
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.orange[500],
    borderRadius: 2,
  },
  questionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  questionLabel: {
    fontSize: 14,
    color: colors.gray[500],
    marginBottom: 12,
  },
  questionWord: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  optionsContainer: {
    padding: 16,
    gap: 12,
  },
  nextButtonContainer: {
    padding: 16,
    paddingTop: 0,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[500],
    paddingVertical: 16,
    borderRadius: 12,
    gap: 4,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  // Complete screen
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  trophyContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.amber[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 24,
  },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  resultStatItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  resultStatValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.gray[900],
  },
  resultStatLabel: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 4,
  },
  resultStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.gray[200],
  },
  completeActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  retryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    gap: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[600],
  },
  doneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
