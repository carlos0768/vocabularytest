import React, { useState, useCallback } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, BookmarkX, Heart, Layers, Play } from 'lucide-react-native';
import { SolidCard, SortChips } from '../components/ui';
import type { SortChipOption } from '../components/ui';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { getGuestUserId } from '../lib/utils';
import theme from '../constants/theme';
import type { RootStackParamList, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FavoriteWordWithProject extends Word {
  projectTitle: string;
}

type SortKey = 'alpha' | 'status' | 'project';

const SORT_OPTIONS: SortChipOption[] = [
  { key: 'alpha', label: 'アルファベット順' },
  { key: 'status', label: 'ステータス順' },
  { key: 'project', label: '単語帳順' },
];

const STATUS_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  new: { text: '未学習', color: theme.mutedText, bg: theme.surfaceAlt },
  review: { text: '学習中', color: theme.chartBlue, bg: theme.chartBlueBg },
  mastered: { text: '習得済', color: theme.success, bg: theme.successBg },
};

export function FavoritesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, subscription, isAuthenticated, loading: authLoading } = useAuth();

  const [favoriteWords, setFavoriteWords] = useState<FavoriteWordWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('alpha');

  const repository = getRepository(subscription?.status || 'free');

  const loadFavorites = useCallback(async () => {
    if (authLoading) return;
    try {
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const projects = await repository.getProjects(userId);
      const allFavorites: FavoriteWordWithProject[] = [];
      for (const project of projects) {
        const words = await repository.getWords(project.id);
        allFavorites.push(
          ...words.filter((w) => w.isFavorite).map((w) => ({ ...w, projectTitle: project.title }))
        );
      }
      setFavoriteWords(allFavorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  }, [repository, isAuthenticated, user, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadFavorites();
    }, [loadFavorites])
  );

  const handleToggleFavorite = async (wordId: string) => {
    await repository.updateWord(wordId, { isFavorite: false });
    setFavoriteWords((prev) => prev.filter((w) => w.id !== wordId));
  };

  const handleStartFlashcard = () => {
    if (favoriteWords.length === 0) {
      Alert.alert('苦手単語がありません', '単語をブックマークしてください。');
      return;
    }
    navigation.navigate('FavoritesFlashcard');
  };

  const handleStartQuiz = () => {
    if (favoriteWords.length === 0) {
      Alert.alert('苦手単語がありません', '単語をブックマークしてください。');
      return;
    }
    if (favoriteWords.length < 4) {
      Alert.alert('単語が足りません', 'クイズには4つ以上の苦手単語が必要です。');
      return;
    }
    navigation.navigate('FavoritesQuiz');
  };

  // Sort
  const sortedWords = [...favoriteWords].sort((a, b) => {
    switch (sortKey) {
      case 'alpha':
        return a.english.localeCompare(b.english);
      case 'status': {
        const order = { new: 0, review: 1, mastered: 2 };
        return (order[a.status] ?? 0) - (order[b.status] ?? 0);
      }
      case 'project':
        return a.projectTitle.localeCompare(b.projectTitle);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={theme.secondaryText} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color={theme.primaryText} />
        </TouchableOpacity>
        <Text style={styles.title}>苦手単語</Text>
        <Text style={styles.count}>{favoriteWords.length}語</Text>
      </View>

      {/* Sort bar */}
      <View style={styles.sortWrap}>
        <SortChips options={SORT_OPTIONS} activeKey={sortKey} onSelect={(k) => setSortKey(k as SortKey)} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {sortedWords.length === 0 ? (
          <View style={styles.emptyWrap}>
            <BookmarkX size={48} color={theme.mutedText} />
            <Text style={styles.emptyTitle}>苦手単語がありません</Text>
            <Text style={styles.emptyText}>
              単語のハートアイコンをタップして{'\n'}苦手な単語をマークしましょう
            </Text>
          </View>
        ) : (
          <View style={styles.wordList}>
            {sortedWords.map((word) => {
              const statusInfo = STATUS_LABELS[word.status] ?? STATUS_LABELS.new;
              return (
                <SolidCard key={word.id} style={styles.wordCard}>
                  <View style={styles.wordRow}>
                    <View style={styles.wordInfo}>
                      <Text style={styles.wordEnglish}>{word.english}</Text>
                      <Text style={styles.wordJapanese}>{word.japanese}</Text>
                    </View>
                    <View style={styles.wordTrail}>
                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.statusText, { color: statusInfo.color }]}>
                          {statusInfo.text}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => handleToggleFavorite(word.id)} style={styles.heartBtn}>
                        <Heart size={18} color={theme.danger} fill={theme.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </SolidCard>
              );
            })}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom action buttons */}
      {favoriteWords.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.quizBtn} onPress={handleStartQuiz} activeOpacity={0.85}>
            <Play size={18} color={theme.white} fill={theme.white} />
            <Text style={styles.quizBtnText}>クイズ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.flashcardBtn} onPress={handleStartFlashcard} activeOpacity={0.85}>
            <Layers size={18} color={theme.primaryText} />
            <Text style={styles.flashcardBtnText}>カード</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.white,
  },
  title: {
    flex: 1,
    fontSize: theme.fontSize.title2,
    fontWeight: '700',
    color: theme.primaryText,
  },
  count: {
    fontSize: theme.fontSize.subheadline,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  sortWrap: {
    paddingVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: theme.fontSize.headline,
    fontWeight: '600',
    color: theme.primaryText,
  },
  emptyText: {
    fontSize: theme.fontSize.callout,
    color: theme.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
  },
  wordList: {
    gap: 8,
  },
  wordCard: {
    padding: 14,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wordInfo: {
    flex: 1,
    gap: 2,
  },
  wordEnglish: {
    fontSize: theme.fontSize.headline,
    fontWeight: '600',
    color: theme.primaryText,
  },
  wordJapanese: {
    fontSize: theme.fontSize.subheadline,
    color: theme.secondaryText,
  },
  wordTrail: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  heartBtn: {
    padding: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: theme.background,
    
    
    
    
    
  },
  quizBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.accentBlack,
    gap: 8,
  },
  quizBtnText: {
    fontSize: theme.fontSize.headline,
    fontWeight: '700',
    color: theme.white,
  },
  flashcardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.white,
    gap: 8,
  },
  flashcardBtnText: {
    fontSize: theme.fontSize.headline,
    fontWeight: '700',
    color: theme.primaryText,
  },
});
