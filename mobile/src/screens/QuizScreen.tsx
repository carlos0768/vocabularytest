import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, ChevronRight, Trophy, RotateCcw, Settings, Flag } from 'lucide-react-native';
import { Button } from '../components/ui';
import { QuizOption } from '../components/quiz';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { shuffleArray, updateDailyStats, recordWrongAnswer } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word, QuizQuestion, WordStatus } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Quiz'>;

const DEFAULT_QUESTION_COUNT = 10;

interface WrongAnswerItem {
  word: Word;
  selectedAnswer: string;
}

export function QuizScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const projectId = route.params.projectId;
  const { subscription, isAuthenticated, loading: authLoading } = useAuth();

  const [allWords, setAllWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [results, setResults] = useState({ correct: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerItem[]>([]);

  // Question count selection
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [inputCount, setInputCount] = useState('');

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(subscription?.status || 'free');

  // Generate quiz questions
  const generateQuestions = useCallback((words: Word[], count: number): QuizQuestion[] => {
    // Prioritize non-mastered words
    const prioritized = words
      .filter((w) => w.status !== 'mastered')
      .concat(words.filter((w) => w.status === 'mastered'));

    // Take up to count questions
    const selected = shuffleArray(prioritized).slice(0, count);

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
        setAllWords(words);

        // Only generate questions if question count is set
        if (questionCount) {
          const generated = generateQuestions(words, questionCount);
          setQuestions(generated);
        }
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
  }, [projectId, repository, navigation, generateQuestions, authLoading, isAuthenticated, questionCount]);

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
      // Track wrong answer
      setWrongAnswers((prev) => [
        ...prev,
        { word, selectedAnswer: currentQuestion.options[index] },
      ]);
      // Record to persistent storage
      await recordWrongAnswer(
        word.id,
        word.english,
        word.japanese,
        projectId,
        word.distractors
      );
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

  // Handle question count selection
  const handleSelectCount = (count: number) => {
    setQuestionCount(count);
    if (allWords.length > 0) {
      const generated = generateQuestions(allWords, count);
      setQuestions(generated);
      setCurrentIndex(0);
      setSelectedIndex(null);
      setIsRevealed(false);
      setResults({ correct: 0, total: 0 });
      setWrongAnswers([]);
      setIsComplete(false);
    }
  };

  // Restart quiz with new random questions
  const handleRestart = () => {
    const regenerated = generateQuestions(allWords, questionCount || DEFAULT_QUESTION_COUNT);
    setQuestions(regenerated);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setWrongAnswers([]);
    setIsComplete(false);
  };

  // Toggle favorite
  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;
    const word = currentQuestion.word;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(word.id, { isFavorite: newFavorite });
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === currentIndex
          ? { ...q, word: { ...q.word, isFavorite: newFavorite } }
          : q
      )
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>クイズを準備中...</Text>
      </View>
    );
  }

  // Question count selection screen
  if (!questionCount) {
    const maxQuestions = allWords.length;
    const parsedInput = parseInt(inputCount, 10);
    const isValidInput = !isNaN(parsedInput) && parsedInput >= 1 && parsedInput <= maxQuestions;

    const handleSubmit = () => {
      if (isValidInput) {
        handleSelectCount(parsedInput);
      }
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
          >
            <X size={24} color={colors.gray[600]} />
          </TouchableOpacity>
        </View>

        <View style={styles.countSelectionContainer}>
          <Text style={styles.countSelectionTitle}>問題数を入力</Text>
          <Text style={styles.countSelectionSubtitle}>
            1〜{maxQuestions}問まで
          </Text>

          <View style={styles.countInputContainer}>
            <TextInput
              style={styles.countInput}
              value={inputCount}
              onChangeText={setInputCount}
              keyboardType="number-pad"
              placeholder={String(DEFAULT_QUESTION_COUNT)}
              placeholderTextColor={colors.gray[400]}
              autoFocus
              maxLength={3}
              onSubmitEditing={handleSubmit}
            />
            <Text style={styles.countUnit}>問</Text>
          </View>

          <Button
            onPress={handleSubmit}
            disabled={!isValidInput}
            size="lg"
            style={styles.startButton}
          >
            スタート
          </Button>
        </View>
      </SafeAreaView>
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
        <ScrollView contentContainerStyle={styles.resultsScrollContent}>
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

            {/* Wrong answers list */}
            {wrongAnswers.length > 0 && (
              <View style={styles.wrongAnswersSection}>
                <Text style={styles.wrongAnswersTitle}>
                  間違えた問題 ({wrongAnswers.length}問)
                </Text>
                {wrongAnswers.map((item, index) => (
                  <View key={index} style={styles.wrongAnswerItem}>
                    <Text style={styles.wrongAnswerEnglish}>
                      {item.word.english}
                    </Text>
                    <Text style={styles.wrongAnswerCorrect}>
                      正解: {item.word.japanese}
                    </Text>
                    <Text style={styles.wrongAnswerSelected}>
                      あなたの回答: {item.selectedAnswer}
                    </Text>
                  </View>
                ))}
              </View>
            )}

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
        </ScrollView>
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
          {/* Favorite button */}
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.favoriteButton}
          >
            <Flag
              size={24}
              color={currentQuestion?.word.isFavorite ? colors.orange[500] : colors.gray[400]}
              fill={currentQuestion?.word.isFavorite ? colors.orange[500] : 'transparent'}
            />
          </TouchableOpacity>
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

        {/* Next button (shown after any answer) */}
        {isRevealed && (
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
    marginBottom: 16,
  },
  favoriteButton: {
    padding: 8,
    borderRadius: 20,
  },
  optionsContainer: {
    marginBottom: 24,
  },
  nextButton: {
    marginTop: 12,
  },
  // Count selection styles
  countSelectionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  countSelectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 8,
  },
  countSelectionSubtitle: {
    fontSize: 16,
    color: colors.gray[500],
    marginBottom: 32,
  },
  countInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  countInput: {
    width: 100,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.gray[200],
    borderRadius: 16,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  countUnit: {
    fontSize: 20,
    color: colors.gray[500],
    marginLeft: 8,
  },
  startButton: {
    width: '100%',
    maxWidth: 200,
  },
  // Results styles
  resultsScrollContent: {
    flexGrow: 1,
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
    marginBottom: 24,
  },
  // Wrong answers section
  wrongAnswersSection: {
    width: '100%',
    marginBottom: 24,
  },
  wrongAnswersTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.red[600],
    marginBottom: 12,
    textAlign: 'center',
  },
  wrongAnswerItem: {
    backgroundColor: colors.red[50],
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  wrongAnswerEnglish: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: 4,
  },
  wrongAnswerCorrect: {
    fontSize: 14,
    color: colors.emerald[600],
    marginBottom: 2,
  },
  wrongAnswerSelected: {
    fontSize: 14,
    color: colors.red[600],
  },
  resultActions: {
    width: '100%',
    gap: 12,
  },
  resultButton: {
    width: '100%',
  },
});
