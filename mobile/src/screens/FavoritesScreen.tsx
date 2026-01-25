import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Flag, Layers, Play } from 'lucide-react-native';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { getGuestUserId } from '../lib/utils';
import colors from '../constants/colors';
import type { RootStackParamList, Word, Project } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FavoriteWordWithProject extends Word {
  projectTitle: string;
}

export function FavoritesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, subscription, isAuthenticated, loading: authLoading } = useAuth();

  const [favoriteWords, setFavoriteWords] = useState<FavoriteWordWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  const repository = getRepository(subscription?.status || 'free');

  const loadFavorites = useCallback(async () => {
    if (authLoading) return;

    try {
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const projects = await repository.getProjects(userId);

      const allFavorites: FavoriteWordWithProject[] = [];

      for (const project of projects) {
        const words = await repository.getWords(project.id);
        const favorites = words
          .filter((w) => w.isFavorite)
          .map((w) => ({ ...w, projectTitle: project.title }));
        allFavorites.push(...favorites);
      }

      setFavoriteWords(allFavorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  }, [repository, isAuthenticated, user, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadFavorites();
    }
  }, [loadFavorites, authLoading]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadFavorites();
    });
    return unsubscribe;
  }, [navigation, loadFavorites]);

  const handleToggleFavorite = async (wordId: string) => {
    await repository.updateWord(wordId, { isFavorite: false });
    setFavoriteWords((prev) => prev.filter((w) => w.id !== wordId));
  };

  const handleStartFlashcard = () => {
    if (favoriteWords.length === 0) {
      Alert.alert('苦手単語がありません', '単語をフラグでマークしてください。');
      return;
    }
    navigation.navigate('FavoritesFlashcard');
  };

  const handleStartQuiz = () => {
    if (favoriteWords.length === 0) {
      Alert.alert('苦手単語がありません', '単語をフラグでマークしてください。');
      return;
    }
    if (favoriteWords.length < 4) {
      Alert.alert('単語が足りません', 'クイズには4つ以上の苦手単語が必要です。');
      return;
    }
    navigation.navigate('FavoritesQuiz');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Flag size={18} color={colors.orange[500]} />
          <Text style={styles.headerTitle}>苦手単語</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.wordCount}>{favoriteWords.length}語</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {favoriteWords.length === 0 ? (
          <View style={styles.emptyState}>
            <Flag size={32} color={colors.gray[300]} />
            <Text style={styles.emptyTitle}>苦手単語がありません</Text>
            <Text style={styles.emptyText}>
              単語の横にあるフラグアイコンをタップして{'\n'}苦手な単語をマークしましょう
            </Text>
          </View>
        ) : (
          <View style={styles.wordList}>
            {favoriteWords.map((word) => (
              <View key={word.id} style={styles.wordItem}>
                <View style={styles.wordItemContent}>
                  <View style={styles.wordItemHeader}>
                    <Text style={styles.wordItemEnglish}>{word.english}</Text>
                    <Text style={styles.projectBadge}>{word.projectTitle}</Text>
                  </View>
                  <Text style={styles.wordItemJapanese}>{word.japanese}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleToggleFavorite(word.id)}
                  style={styles.favoriteButton}
                >
                  <Flag
                    size={18}
                    color={colors.orange[500]}
                    fill={colors.orange[500]}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom action buttons */}
      {favoriteWords.length > 0 && (
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleStartQuiz}
          >
            <Play size={20} color={colors.white} fill={colors.white} />
            <Text style={styles.actionButtonText}>クイズ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonTertiary]}
            onPress={handleStartFlashcard}
          >
            <Layers size={20} color={colors.primary[600]} />
            <Text style={styles.actionButtonTextTertiary}>カード</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
  },
  headerRight: {
    marginLeft: 'auto',
  },
  wordCount: {
    fontSize: 14,
    color: colors.gray[500],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  wordList: {
    gap: 8,
  },
  wordItem: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordItemContent: {
    flex: 1,
  },
  wordItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordItemEnglish: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray[900],
  },
  projectBadge: {
    fontSize: 10,
    color: colors.gray[500],
    backgroundColor: colors.gray[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  wordItemJapanese: {
    fontSize: 14,
    color: colors.gray[500],
    marginTop: 4,
  },
  favoriteButton: {
    padding: 8,
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    backgroundColor: colors.white,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    gap: 8,
  },
  actionButtonTertiary: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  actionButtonTextTertiary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[600],
  },
});
