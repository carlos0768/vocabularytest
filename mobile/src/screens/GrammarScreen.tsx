import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft,
  BookText,
  Play,
  Trash2,
  Camera,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import colors from '../constants/colors';
import type { RootStackParamList, AIGrammarExtraction } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type GrammarRouteProp = RouteProp<RootStackParamList, 'Grammar'>;

export function GrammarScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<GrammarRouteProp>();
  const { projectId } = route.params;

  // State
  const [patterns, setPatterns] = useState<AIGrammarExtraction[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz state
  const [quizMode, setQuizMode] = useState(false);
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Load patterns from AsyncStorage
  const loadPatterns = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(`grammar_patterns_${projectId}`);
      if (data) {
        setPatterns(JSON.parse(data));
      }
    } catch (error) {
      console.error('Failed to load patterns:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Load on mount and on focus
  useFocusEffect(
    useCallback(() => {
      loadPatterns();
    }, [loadPatterns])
  );

  // Clear all patterns
  const handleClearAll = () => {
    Alert.alert(
      '削除の確認',
      'すべての文法パターンを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(`grammar_patterns_${projectId}`);
            setPatterns([]);
          },
        },
      ]
    );
  };

  // Get all quiz questions flattened
  const allQuestions = patterns.flatMap((pattern, patternIndex) =>
    (pattern.quizQuestions || []).map((q, questionIndex) => ({
      ...q,
      patternName: pattern.patternName,
      patternIndex,
      questionIndex,
    }))
  );

  const totalQuestions = allQuestions.length;

  // Quiz handlers
  const currentPattern = patterns[currentPatternIndex];
  const currentQuestion = currentPattern?.quizQuestions?.[currentQuestionIndex];

  const handleStartQuiz = () => {
    if (totalQuestions === 0) {
      Alert.alert('エラー', 'クイズ問題がありません');
      return;
    }
    setCurrentPatternIndex(0);
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
      // Next question in same pattern
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
    } else if (currentPatternIndex + 1 < patterns.length) {
      // Next pattern
      setCurrentPatternIndex(prev => prev + 1);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    } else {
      // Quiz complete
      setQuizMode(false);
      setCurrentPatternIndex(0);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  };

  // Calculate current question number across all patterns
  const getCurrentQuestionNumber = () => {
    let count = 0;
    for (let i = 0; i < currentPatternIndex; i++) {
      count += patterns[i]?.quizQuestions?.length || 0;
    }
    return count + currentQuestionIndex + 1;
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.emerald[600]} />
        </View>
      </SafeAreaView>
    );
  }

  // Quiz mode render
  if (quizMode && currentQuestion) {
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setQuizMode(false)}
            style={styles.backButton}
          >
            <ArrowLeft size={20} color={colors.gray[600]} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{currentPattern.patternName}</Text>
            <Text style={styles.headerSubtitle}>
              問題 {getCurrentQuestionNumber()} / {totalQuestions}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.quizContent}>
          {/* Question */}
          <View style={styles.questionSection}>
            <Text style={styles.questionText}>{currentQuestion.question}</Text>
            {currentQuestion.questionJa && (
              <Text style={styles.questionJaText}>{currentQuestion.questionJa}</Text>
            )}
          </View>

          {/* Options */}
          {currentQuestion.questionType === 'choice' && currentQuestion.options ? (
            <View style={styles.optionsContainer}>
              {currentQuestion.options.map((option, index) => {
                let bgColor = colors.white;
                let borderColor = colors.gray[200];
                let textColor = colors.gray[900];

                if (showAnswer) {
                  if (option === currentQuestion.correctAnswer) {
                    bgColor = colors.emerald[50];
                    borderColor = colors.emerald[300];
                    textColor = colors.emerald[800];
                  } else if (option === selectedAnswer && !isCorrect) {
                    bgColor = colors.red[50];
                    borderColor = colors.red[300];
                    textColor = colors.red[800];
                  } else {
                    bgColor = colors.gray[50];
                    textColor = colors.gray[400];
                  }
                }

                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleSelectAnswer(option)}
                    disabled={showAnswer}
                    style={[
                      styles.optionButton,
                      { backgroundColor: bgColor, borderColor },
                    ]}
                  >
                    <Text style={[styles.optionText, { color: textColor }]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {/* Answer feedback */}
          {showAnswer && (
            <View style={styles.feedbackSection}>
              <View style={[
                styles.feedbackBanner,
                { backgroundColor: isCorrect ? colors.emerald[50] : colors.red[50] },
              ]}>
                <Text style={[
                  styles.feedbackText,
                  { color: isCorrect ? colors.emerald[800] : colors.red[800] },
                ]}>
                  {isCorrect ? '正解!' : '不正解'}
                </Text>
                {!isCorrect && (
                  <Text style={styles.correctAnswerText}>
                    正解: {currentQuestion.correctAnswer}
                  </Text>
                )}
              </View>

              <View style={styles.explanationBox}>
                <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
              </View>

              <TouchableOpacity
                onPress={handleNextQuestion}
                style={styles.nextButton}
              >
                {getCurrentQuestionNumber() < totalQuestions ? (
                  <>
                    <Text style={styles.nextButtonText}>次へ</Text>
                    <ChevronRight size={20} color={colors.white} />
                  </>
                ) : (
                  <>
                    <Check size={20} color={colors.white} />
                    <Text style={styles.nextButtonText}>完了</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Main view
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>文法クイズ</Text>
        {patterns.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.headerRightButton}>
            <Trash2 size={20} color={colors.gray[400]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Empty state */}
        {patterns.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <BookText size={40} color={colors.gray[400]} />
            </View>
            <Text style={styles.emptyTitle}>文法問題がありません</Text>
            <Text style={styles.emptyText}>
              ホーム画面の＋ボタンから{'\n'}「文法をスキャン」で問題を追加しましょう
            </Text>
          </View>
        )}

        {/* Has patterns - show quiz start */}
        {patterns.length > 0 && (
          <View style={styles.quizStartSection}>
            {/* Summary */}
            <View style={styles.summarySection}>
              <View style={styles.summaryIcon}>
                <BookText size={40} color={colors.emerald[600]} />
              </View>
              <Text style={styles.summaryTitle}>文法クイズ</Text>
              <Text style={styles.summarySubtitle}>
                {patterns.length}つの文法パターン・{totalQuestions}問
              </Text>
            </View>

            {/* Pattern list */}
            <View style={styles.patternList}>
              {patterns.map((pattern, index) => (
                <View key={index} style={styles.patternItem}>
                  <View style={styles.patternIcon}>
                    <BookText size={16} color={colors.emerald[600]} />
                  </View>
                  <View style={styles.patternInfo}>
                    <Text style={styles.patternName}>{pattern.patternName}</Text>
                    <Text style={styles.patternCount}>
                      {pattern.quizQuestions?.length || 0}問
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Start quiz button */}
            <TouchableOpacity
              onPress={handleStartQuiz}
              disabled={totalQuestions === 0}
              style={[
                styles.startButton,
                totalQuestions === 0 && styles.startButtonDisabled,
              ]}
            >
              <Play size={20} color={colors.white} />
              <Text style={styles.startButtonText}>クイズを開始</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.gray[500],
    marginTop: 2,
  },
  headerRightButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.gray[900],
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
  },

  // Quiz start section
  quizStartSection: {
    gap: 24,
  },
  summarySection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  summaryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.emerald[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: 8,
  },
  summarySubtitle: {
    fontSize: 14,
    color: colors.gray[500],
  },

  // Pattern list
  patternList: {
    gap: 12,
  },
  patternItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    gap: 12,
  },
  patternIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.emerald[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternInfo: {
    flex: 1,
  },
  patternName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray[900],
  },
  patternCount: {
    fontSize: 13,
    color: colors.gray[500],
    marginTop: 2,
  },

  // Start button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: colors.emerald[600],
    borderRadius: 12,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

  // Quiz content
  quizContent: {
    padding: 16,
    paddingBottom: 40,
  },
  questionSection: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.gray[900],
    marginBottom: 8,
  },
  questionJaText: {
    fontSize: 14,
    color: colors.gray[500],
  },

  // Options
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  optionText: {
    fontSize: 15,
  },

  // Feedback
  feedbackSection: {
    gap: 16,
  },
  feedbackBanner: {
    padding: 16,
    borderRadius: 12,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: '600',
  },
  correctAnswerText: {
    fontSize: 14,
    color: colors.gray[600],
    marginTop: 4,
  },
  explanationBox: {
    padding: 16,
    backgroundColor: colors.primary[50],
    borderRadius: 12,
  },
  explanationText: {
    fontSize: 14,
    color: colors.primary[800],
    lineHeight: 22,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.primary[600],
    borderRadius: 12,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});
