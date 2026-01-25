import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Flag,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { getGuestUserId, shuffleArray } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function FavoritesFlashcardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flipAnim] = useState(new Animated.Value(0));

  const repository = getRepository(isAuthenticated ? 'active' : 'free');

  // Load favorite words from all projects
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

      if (allFavorites.length === 0) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
        return;
      }

      setWords(shuffleArray(allFavorites));
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
  }, [repository, navigation, authLoading, isAuthenticated, user]);

  useEffect(() => {
    if (!authLoading) {
      loadFavorites();
    }
  }, [loadFavorites, authLoading]);

  const currentWord = words[currentIndex];

  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  };

  const handleShuffle = () => {
    setWords(shuffleArray([...words]));
    setCurrentIndex(0);
    setIsFlipped(false);
    flipAnim.setValue(0);
  };

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });

    if (!newFavorite) {
      // Remove from list if unfavorited
      const newWords = words.filter((_, i) => i !== currentIndex);
      if (newWords.length === 0) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
        return;
      }
      setWords(newWords);
      if (currentIndex >= newWords.length) {
        setCurrentIndex(newWords.length - 1);
      }
      setIsFlipped(false);
      flipAnim.setValue(0);
    } else {
      setWords((prev) =>
        prev.map((w, i) =>
          i === currentIndex ? { ...w, isFavorite: newFavorite } : w
        )
      );
    }
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
        <Text style={styles.loadingText}>苦手単語を読み込み中...</Text>
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
          <Flag size={16} color={colors.orange[500]} />
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
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleFlip}
          style={styles.cardTouchable}
        >
          {/* Front (English) */}
          <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
            <Text style={styles.englishText}>{currentWord?.english}</Text>
            <View style={styles.cardHint}>
              <Eye size={16} color={colors.gray[400]} />
              <Text style={styles.hintText}>タップで意味を見る</Text>
            </View>
          </Animated.View>

          {/* Back (Japanese) */}
          <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
            <Text style={styles.japaneseText}>{currentWord?.japanese}</Text>

            {/* Example sentence */}
            {currentWord?.exampleSentence && (
              <View style={styles.exampleContainer}>
                <Text style={styles.exampleText}>{currentWord.exampleSentence}</Text>
                {currentWord.exampleSentenceJa && (
                  <Text style={styles.exampleTextJa}>{currentWord.exampleSentenceJa}</Text>
                )}
              </View>
            )}

            <View style={styles.cardHintBack}>
              <EyeOff size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.hintTextBack}>タップで戻る</Text>
            </View>
          </Animated.View>
        </TouchableOpacity>

        {/* Favorite button */}
        <TouchableOpacity
          onPress={handleToggleFavorite}
          style={styles.favoriteButton}
        >
          <Flag
            size={24}
            color={currentWord?.isFavorite ? colors.orange[500] : colors.gray[400]}
            fill={currentWord?.isFavorite ? colors.orange[500] : 'transparent'}
          />
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity
          onPress={handlePrev}
          disabled={currentIndex === 0}
          style={[
            styles.navButton,
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
        >
          <ChevronLeft
            size={24}
            color={currentIndex === 0 ? colors.gray[300] : colors.gray[600]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          disabled={currentIndex === words.length - 1}
          style={[
            styles.navButton,
            currentIndex === words.length - 1 && styles.navButtonDisabled,
          ]}
        >
          <ChevronRight
            size={24}
            color={
              currentIndex === words.length - 1
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
    gap: 6,
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
  cardBack: {
    backgroundColor: colors.orange[500],
  },
  englishText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
  },
  japaneseText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  exampleContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  exampleText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  exampleTextJa: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 4,
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
  favoriteButton: {
    marginTop: 24,
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
