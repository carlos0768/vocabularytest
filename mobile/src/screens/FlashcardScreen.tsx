import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Flag,
  Eye,
  EyeOff,
  Volume2,
  Trash2,
} from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { shuffleArray, saveFlashcardProgress, loadFlashcardProgress } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Flashcard'>;

export function FlashcardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const projectId = route.params.projectId;
  const favoritesOnly = route.params.favoritesOnly ?? false;
  const { subscription, isPro, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flipAnim] = useState(new Animated.Value(0));
  const [isAnimating, setIsAnimating] = useState(false);

  // Swipe animation
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Refs to track current state for PanResponder
  const currentIndexRef = useRef(currentIndex);
  const wordsLengthRef = useRef(words.length);
  const isAnimatingRef = useRef(isAnimating);
  const wordsRef = useRef(words);

  // Keep refs in sync with state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    wordsLengthRef.current = words.length;
    wordsRef.current = words;
  }, [words]);

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  // Authenticated users use remote repository (Supabase), guests use local SQLite
  const repository = getRepository(subscription?.status || 'free');

  // Save progress when index or words change
  const saveProgress = useCallback(async (wordList: Word[], index: number) => {
    if (wordList.length > 0) {
      await saveFlashcardProgress(
        projectId,
        favoritesOnly,
        wordList.map(w => w.id),
        index
      );
    }
  }, [projectId, favoritesOnly]);

  // Save progress when current index changes
  useEffect(() => {
    if (words.length > 0 && !loading) {
      saveProgress(words, currentIndex);
    }
  }, [currentIndex, words, saveProgress, loading]);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    // Only require Pro for non-favorites mode
    if (!isPro && !favoritesOnly) {
      navigation.navigate('Subscription');
      return;
    }

    const loadWords = async () => {
      try {
        const allWords = await repository.getWords(projectId);
        const wordsData = favoritesOnly
          ? allWords.filter((w) => w.isFavorite)
          : allWords;

        if (wordsData.length === 0) {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Main');
          }
          return;
        }

        // Check for saved progress
        const savedProgress = await loadFlashcardProgress(projectId, favoritesOnly);

        if (savedProgress) {
          // Reconstruct word order from saved IDs
          const wordMap = new Map(wordsData.map(w => [w.id, w]));
          const orderedWords = savedProgress.wordIds
            .map(id => wordMap.get(id))
            .filter((w): w is Word => w !== undefined);

          // If most words still exist, resume automatically
          if (orderedWords.length >= wordsData.length * 0.8) {
            setWords(orderedWords);
            setCurrentIndex(savedProgress.currentIndex);
            setLoading(false);
            return;
          }
        }

        // No valid saved progress - start fresh with shuffled words
        setWords(shuffleArray(wordsData));
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
  }, [projectId, repository, navigation, authLoading, favoritesOnly, isPro]);

  const currentWord = words[currentIndex];

  const handleFlip = () => {
    if (isAnimating) return;
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleNext = (withAnimation = false) => {
    if (currentIndex < words.length - 1 && !isAnimating) {
      if (withAnimation) {
        setIsAnimating(true);
        // Exit to left
        Animated.timing(swipeAnim, {
          toValue: -SCREEN_WIDTH * 1.2,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setCurrentIndex((prev) => prev + 1);
          setIsFlipped(false);
          flipAnim.setValue(0);
          // Enter from right
          swipeAnim.setValue(SCREEN_WIDTH * 1.2);
          Animated.timing(swipeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setIsAnimating(false);
          });
        });
      } else {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        flipAnim.setValue(0);
      }
    }
  };

  const handlePrev = (withAnimation = false) => {
    if (currentIndex > 0 && !isAnimating) {
      if (withAnimation) {
        setIsAnimating(true);
        // Exit to right
        Animated.timing(swipeAnim, {
          toValue: SCREEN_WIDTH * 1.2,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setCurrentIndex((prev) => prev - 1);
          setIsFlipped(false);
          flipAnim.setValue(0);
          // Enter from left
          swipeAnim.setValue(-SCREEN_WIDTH * 1.2);
          Animated.timing(swipeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setIsAnimating(false);
          });
        });
      } else {
        setCurrentIndex((prev) => prev - 1);
        setIsFlipped(false);
        flipAnim.setValue(0);
      }
    }
  };

  const handleShuffle = () => {
    if (isAnimating) return;
    const shuffled = shuffleArray([...words]);
    setWords(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    flipAnim.setValue(0);
    swipeAnim.setValue(0);
    // Save new shuffled order
    saveProgress(shuffled, 0);
  };

  // Refs for handler functions
  const handleNextRef = useRef<(withAnimation?: boolean) => void>(() => {});
  const handlePrevRef = useRef<(withAnimation?: boolean) => void>(() => {});

  // Update handler refs when functions change
  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePrevRef.current = handlePrev;
  });

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        // Reset animations when starting a new gesture
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isAnimatingRef.current) {
          swipeAnim.setValue(gestureState.dx);
          rotateAnim.setValue(gestureState.dx * 0.02);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isAnimatingRef.current) return;

        if (gestureState.dx < -SWIPE_THRESHOLD && currentIndexRef.current < wordsLengthRef.current - 1) {
          // Swipe left - next
          handleNextRef.current(true);
        } else if (gestureState.dx > SWIPE_THRESHOLD && currentIndexRef.current > 0) {
          // Swipe right - prev
          handlePrevRef.current(true);
        } else {
          // Reset position
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
        rotateAnim.setValue(0);
      },
      onPanResponderTerminate: () => {
        // Reset if gesture is terminated
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        rotateAnim.setValue(0);
      },
    })
  ).current;

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords((prev) =>
      prev.map((w, i) =>
        i === currentIndex ? { ...w, isFavorite: newFavorite } : w
      )
    );
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;

    Alert.alert(
      '単語を削除',
      `「${currentWord.english}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await repository.deleteWord(currentWord.id);

            // Remove word from state
            const newWords = words.filter((_, i) => i !== currentIndex);

            if (newWords.length === 0) {
              // No more words, go back
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Main');
              }
              return;
            }

            // Adjust index if we deleted the last word
            const newIndex = currentIndex >= newWords.length ? newWords.length - 1 : currentIndex;
            setWords(newWords);
            setCurrentIndex(newIndex);
            setIsFlipped(false);
            flipAnim.setValue(0);
          },
        },
      ]
    );
  };

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Main');
    }
  };

  // Interpolations for flip animation
  const frontAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['180deg', '360deg'],
        }),
      },
    ],
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>フラッシュカードを準備中...</Text>
      </View>
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
          {favoritesOnly && (
            <View style={styles.favoriteBadge}>
              <Flag size={12} fill={colors.orange[500]} color={colors.orange[500]} />
              <Text style={styles.favoriteBadgeText}>苦手</Text>
            </View>
          )}
          <Text style={styles.progress}>
            {currentIndex + 1} / {words.length}
          </Text>
        </View>

        <TouchableOpacity onPress={handleShuffle} style={styles.headerButton}>
          <RotateCcw size={20} color={colors.gray[600]} />
        </TouchableOpacity>
      </View>

      {/* Card area */}
      <View style={styles.cardContainer}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.cardTouchable,
            {
              transform: [
                { translateX: swipeAnim },
                { rotate: rotateAnim.interpolate({
                  inputRange: [-10, 10],
                  outputRange: ['-10deg', '10deg'],
                  extrapolate: 'clamp',
                }) },
              ],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={handleFlip}
            style={styles.cardTouchableInner}
          >
            {/* Front (English) */}
            <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
              {/* Voice button above the word */}
              <TouchableOpacity
                onPress={() => {
                  if (currentWord?.english) {
                    Speech.speak(currentWord.english, { language: 'en-US', rate: 0.9 });
                  }
                }}
                style={styles.voiceButton}
              >
                <Volume2 size={24} color={colors.gray[400]} />
              </TouchableOpacity>
              <View style={styles.cardTextContainer}>
                <Text
                  style={styles.englishText}
                  numberOfLines={4}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {currentWord?.english}
                </Text>
              </View>
              <View style={styles.cardHint}>
                <Eye size={16} color={colors.gray[400]} />
                <Text style={styles.hintText}>タップで意味を見る</Text>
              </View>
            </Animated.View>

            {/* Back (Japanese) */}
            <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
              <View style={styles.cardTextContainer}>
                <Text
                  style={styles.japaneseText}
                  numberOfLines={4}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {currentWord?.japanese}
                </Text>
              </View>
              <View style={styles.cardHintBack}>
                <EyeOff size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.hintTextBack}>タップで戻る</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.actionButton}
          >
            <Flag
              size={24}
              color={currentWord?.isFavorite ? colors.orange[500] : colors.gray[400]}
              fill={currentWord?.isFavorite ? colors.orange[500] : 'transparent'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDeleteWord}
            style={styles.actionButton}
          >
            <Trash2 size={24} color={colors.gray[400]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity
          onPress={() => handlePrev(true)}
          disabled={currentIndex === 0 || isAnimating}
          style={[
            styles.navButton,
            (currentIndex === 0 || isAnimating) && styles.navButtonDisabled,
          ]}
        >
          <ChevronLeft
            size={24}
            color={(currentIndex === 0 || isAnimating) ? colors.gray[300] : colors.gray[600]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleNext(true)}
          disabled={currentIndex === words.length - 1 || isAnimating}
          style={[
            styles.navButton,
            (currentIndex === words.length - 1 || isAnimating) && styles.navButtonDisabled,
          ]}
        >
          <ChevronRight
            size={24}
            color={
              (currentIndex === words.length - 1 || isAnimating)
                ? colors.gray[300]
                : colors.gray[600]
            }
          />
        </TouchableOpacity>
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
    padding: 8,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.orange[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  favoriteBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.orange[700],
  },
  progress: {
    fontSize: 14,
    color: colors.gray[500],
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardTouchable: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 3 / 4,
  },
  cardTouchableInner: {
    width: '100%',
    height: '100%',
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardFront: {
    backgroundColor: colors.white,
  },
  voiceButton: {
    position: 'absolute',
    top: 24,
    padding: 8,
  },
  cardBack: {
    backgroundColor: colors.primary[600],
  },
  cardTextContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 40,
  },
  englishText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
    width: '100%',
  },
  japaneseText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    width: '100%',
  },
  cardHint: {
    position: 'absolute',
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintText: {
    fontSize: 12,
    color: colors.gray[400],
  },
  cardHintBack: {
    position: 'absolute',
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintTextBack: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
  },
  actionButton: {
    padding: 12,
    borderRadius: 24,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navButtonDisabled: {
    backgroundColor: colors.gray[100],
    shadowOpacity: 0,
    elevation: 0,
  },
});
