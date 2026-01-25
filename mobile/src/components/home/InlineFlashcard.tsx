import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Volume2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react-native';
import colors from '../../constants/colors';
import type { Word } from '../../types';

interface InlineFlashcardProps {
  words: Word[];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function InlineFlashcard({ words }: InlineFlashcardProps) {
  const [shuffledWords, setShuffledWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Shuffle words on mount or when words change
  const reshuffleWords = useCallback(() => {
    if (words.length > 0) {
      setShuffledWords(shuffleArray([...words]));
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [words]);

  useEffect(() => {
    reshuffleWords();
  }, [reshuffleWords]);

  const currentWord = shuffledWords[currentIndex];

  // Text-to-speech (disabled for now - requires native module rebuild)
  const speakWord = () => {
    // TODO: Implement TTS when native modules are rebuilt
    // For now, just show an alert
    Alert.alert('音声機能', '音声再生機能は現在準備中です');
  };

  // Navigation
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const goToNext = () => {
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      // Loop back to beginning with reshuffle
      reshuffleWords();
    }
  };

  if (words.length === 0 || !currentWord) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>単語を追加して学習を始めましょう</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {shuffledWords.length}
        </Text>
        <TouchableOpacity
          onPress={reshuffleWords}
          style={styles.shuffleButton}
        >
          <RotateCcw size={16} color={colors.gray[500]} />
        </TouchableOpacity>
      </View>

      {/* Flashcard */}
      <View style={styles.cardContainer}>
        {/* Left arrow button */}
        <TouchableOpacity
          onPress={goToPrevious}
          disabled={currentIndex === 0}
          style={[
            styles.navButton,
            styles.navButtonLeft,
            currentIndex === 0 && styles.navButtonDisabled,
          ]}
        >
          <ChevronLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>

        {/* Card content - tap to flip */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => setIsFlipped(prev => !prev)}
        >
          {!isFlipped ? (
            // Front: English
            <View style={styles.cardContent}>
              <TouchableOpacity
                onPress={speakWord}
                style={styles.speakButton}
              >
                <Volume2 size={20} color={colors.gray[400]} />
              </TouchableOpacity>
              <Text style={styles.englishText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>
                {currentWord.english}
              </Text>
              <Text style={styles.hintText}>タップして意味を表示</Text>
            </View>
          ) : (
            // Back: Japanese (same layout as front)
            <View style={styles.cardContent}>
              <Text style={styles.smallTopText} numberOfLines={1}>
                {currentWord.english}
              </Text>
              <Text style={styles.japaneseText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>
                {currentWord.japanese}
              </Text>
              <Text style={styles.hintText}>タップして英語を表示</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Right arrow button */}
        <TouchableOpacity
          onPress={goToNext}
          style={[styles.navButton, styles.navButtonRight]}
        >
          <ChevronRight size={20} color={colors.gray[600]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[100],
    borderRadius: 24,
    padding: 16,
  },
  emptyContainer: {
    backgroundColor: colors.gray[100],
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  shuffleButton: {
    padding: 6,
    borderRadius: 20,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonLeft: {
    marginRight: 8,
  },
  navButtonRight: {
    marginLeft: 8,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 8,
  },
  englishText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
    width: '100%',
  },
  speakButton: {
    padding: 8,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 13,
    color: colors.gray[400],
    marginTop: 8,
  },
  smallTopText: {
    fontSize: 13,
    color: colors.gray[400],
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  japaneseText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
    width: '100%',
  },
});
