import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, ChevronRight, Trophy, RotateCcw } from 'lucide-react-native';
import { Button } from '../components/ui';
import { QuizOption } from '../components/quiz';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { shuffleArray, updateDailyStats } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word, QuizQuestion, WordStatus } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Quiz'>;

export function QuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const projectId = route.params.projectId;
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [results, setResults] = useState({ correct: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(isAuthenticated ? 'active' : 'free');

  // Generate quiz questions
  const generateQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    // Prioritize non-mastered words
    const prioritized = words
      .filter((w) => w.status !== 'mastered')
      .concat(words.filter((w) => w.status === 'mastered'));

    // Take up to 10 questions
    const selected = shuffleArray(prioritized).slice(0, 10);

    return selected.map((word) => {
      const allOptions = [word.japanese, ...word.distractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.japanese);

      return {
        word,
        options: shuffled,
        correctIndex,
      };
    });
  }, []);

  // Load words
  useEffect(() => {
    // Wait for auth to be ready
    if (authLoading) return;

    const loadWords = async () => {
      try {
        console.log('Loading quiz words for project:', projectId, 'isAuthenticated:', isAuthenticated);
        const words = await repository.getWords(projectId);
        console.log('Quiz words loaded:', words.length);
        if (words.length === 0) {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Main');
          }
          return;
        }
        const generated = generateQuestions(words);
        setQuestions(generated);
      } catch (error) {
        console.error('Failed to load words:', error);
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, navigation, generateQuestions, authLoading, isAuthenticated]);

  const currentQuestion = questions[currentIndex];

  // Handle option selection
  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;

    // Update results
    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Update word status
    const word = currentQuestion.word;
    let newStatus: WordStatus = word.status;
    let isMastered = false;

    if (isCorrect) {
      if (word.status === 'new') newStatus = 'review';
      else if (word.status === 'review') {
        newStatus = 'mastered';
        isMastered = true;
      }
    } else {
      if (word.status === 'mastered') newStatus = 'review';
    }

    if (newStatus !== word.status) {
      await repository.updateWord(word.id, { status: newStatus });
    }

    // Update daily stats
    await updateDailyStats(isCorrect, isMastered);

    // Auto-advance on correct answer
    if (isCorrect) {
      setTimeout(() => {
        moveToNext();
      }, 500);
    }
  };

  // Move to next question
  const moveToNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
    }
  };

  // Restart quiz
  const handleRestart = () => {
    const regenerated = generateQuestions(questions.map((q) => q.word));
    setQuestions(regenerated);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>クイズを準備中...</Text>
      </View>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);
    const getMessage = () => {
      if (percentage === 100) return 'パーフェクト！素晴らしい！';
      if (percentage >= 80) return 'よくできました！';
      if (percentage >= 60) return 'もう少し！復習しましょう';
      return '繰り返し練習しましょう！';
    };

    return (
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <X size={24} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>

        {/* Results */}
        <View style={styles.resultsContainer}>
          <View style={styles.resultsCard}>
            <View style={styles.trophyIcon}>
              <Trophy size={40} color={colors.yellow[600]} />
            </View>

            <Text style={styles.completeTitle}>クイズ完了！</Text>

            <View style={styles.scoreSection}>
              <Text style={styles.percentage}>{percentage}%</Text>
              <Text style={styles.scoreText}>
                {results.total}問中 {results.correct}問正解
              </Text>
            </View>

            <Text style={styles.message}>{getMessage()}</Text>

            <View style={styles.resultActions}>
              <Button
                onPress={handleRestart}
                size="lg"
                style={styles.resultButton}
                icon={<RotateCcw size={20} color={colors.white} />}
              >
                もう一度
              </Button>
              <Button
                variant="secondary"
                onPress={() => navigation.goBack()}
                size="lg"
                style={styles.resultButton}
              >
                単語一覧に戻る
              </Button>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <X size={24} color={colors.gray[600]} />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progressSection}>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {questions.length}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${((currentIndex + 1) / questions.length) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Question */}
      <View style={styles.questionContainer}>
        <View style={styles.wordDisplay}>
          <Text style={styles.wordText}>{currentQuestion?.word.english}</Text>
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
              isRevealed={isRevealed}
              onSelect={() => handleSelect(index)}
              disabled={isRevealed}
            />
          ))}
        </View>

        {/* Next button (only on wrong answer) */}
        {isRevealed && selectedIndex !== currentQuestion?.correctIndex && (
          <Button
            onPress={moveToNext}
            size="lg"
            style={styles.nextButton}
            icon={<ChevronRight size={20} color={colors.white} />}
          >
            次へ
          </Button>
        )}
      </View>
    </SafeAreaView>
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
    backgroundColor: colors.gray[50],
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.gray[600],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    backgroundColor: colors.primary[600],
  },
  questionContainer: {
    flex: 1,
    padding: 24,
  },
  wordDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  optionsContainer: {
    marginBottom: 24,
  },
  nextButton: {
    marginTop: 12,
  },
  resultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultsCard: {
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
  completeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 16,
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  percentage: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.primary[600],
  },
  scoreText: {
    fontSize: 16,
    color: colors.gray[500],
    marginTop: 4,
  },
  message: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: 'center',
    marginBottom: 32,
  },
  resultActions: {
    width: '100%',
    gap: 12,
  },
  resultButton: {
    width: '100%',
  },
});
