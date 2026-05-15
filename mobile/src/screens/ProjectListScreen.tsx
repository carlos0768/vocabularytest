import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowUpDown,
  Clock,
  ListFilter,
  Sparkles,
} from 'lucide-react-native';
import { SolidCard, SearchBar, SortChips } from '../components/ui';
import type { SortChipOption } from '../components/ui';
import { ProjectListSkeleton } from '../components/ui/ScreenSkeleton';
import theme, { getThumbnailColor } from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { migrateLocalDataToCloudIfNeeded } from '../lib/db/migration';
import { fetchAllWordsForUser } from '../lib/db/fetch-all-words';
import { getGuestUserId } from '../lib/utils';
import type { HomeStackParamList, Project, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList>;

interface ProjectSummary {
  project: Project;
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  newWords: number;
}

type SortKey = 'wordCount' | 'newest' | 'unmastered';

const SORT_OPTIONS: SortChipOption[] = [
  { key: 'wordCount', label: '単語数順', icon: <ListFilter size={14} color={theme.secondaryText} /> },
  { key: 'newest', label: '新しい順', icon: <Clock size={14} color={theme.secondaryText} /> },
  { key: 'unmastered', label: '未習得順', icon: <Sparkles size={14} color={theme.secondaryText} /> },
];

export function ProjectListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    subscription,
    isAuthenticated,
    isPro,
    loading: authLoading,
  } = useAuth();

  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const isFirstLoadRef = useRef(true);

  const migratedUserIdRef = useRef<string | null>(null);
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  const resolveActiveUserId = useCallback(async () => {
    if (isAuthenticated && user?.id) return user.id;
    return getGuestUserId();
  }, [isAuthenticated, user?.id]);

  const loadProjects = useCallback(
    async (showSpinner = true) => {
      if (authLoading) return;
      if (showSpinner && isFirstLoadRef.current) setLoading(true);

      try {
        if (isAuthenticated && isPro && user?.id && migratedUserIdRef.current !== user.id) {
          await migrateLocalDataToCloudIfNeeded(user.id);
          migratedUserIdRef.current = user.id;
        }
        if (!isAuthenticated) migratedUserIdRef.current = null;

        const activeUserId = await resolveActiveUserId();

        const projects = await repository.getProjects(activeUserId);

        let allWords: Word[] = [];
        if (isPro) {
          allWords = await fetchAllWordsForUser(activeUserId);
        } else {
          for (const p of projects) {
            allWords.push(...(await repository.getWords(p.id)));
          }
        }

        const wordsByProject = new Map<string, Word[]>();
        for (const w of allWords) {
          const list = wordsByProject.get(w.projectId) ?? [];
          list.push(w);
          wordsByProject.set(w.projectId, list);
        }

        const summaries: ProjectSummary[] = projects.map((project) => {
          const words = wordsByProject.get(project.id) ?? [];
          return {
            project,
            totalWords: words.length,
            masteredWords: words.filter((w) => w.status === 'mastered').length,
            learningWords: words.filter((w) => w.status === 'review').length,
            newWords: words.filter((w) => w.status === 'new').length,
          };
        });

        setProjectSummaries(summaries);
      } catch (error) {
        console.error('Failed to load projects:', error);
        Alert.alert('エラー', '単語帳の読み込みに失敗しました。');
      } finally {
        isFirstLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authLoading, isAuthenticated, isPro, repository, resolveActiveUserId, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadProjects();
      });
      return () => task.cancel();
    }, [loadProjects])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadProjects(false);
  }, [loadProjects]);

  // Filter & sort
  const displayedSummaries = useMemo(() => {
    let filtered = projectSummaries;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((s) => s.project.title.toLowerCase().includes(q));
    }
    const sorted = [...filtered];
    switch (sortKey) {
      case 'wordCount':
        sorted.sort((a, b) => b.totalWords - a.totalWords);
        break;
      case 'newest':
        sorted.sort(
          (a, b) =>
            new Date(b.project.createdAt).getTime() - new Date(a.project.createdAt).getTime()
        );
        break;
      case 'unmastered':
        sorted.sort((a, b) => b.newWords - a.newWords);
        break;
    }
    return sorted;
  }, [projectSummaries, searchQuery, sortKey]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accentBlack}
          />
        }
      >
        {/* Title */}
        <Text style={styles.title}>マイ単語帳</Text>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="マイ単語帳を検索"
          />
        </View>

        {/* Sort chips */}
        <SortChips options={SORT_OPTIONS} activeKey={sortKey} onSelect={(k) => setSortKey(k as SortKey)} />

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>すべてのマイ単語帳</Text>
          <Text style={styles.sectionCount}>{projectSummaries.length}件</Text>
        </View>

        {/* Project list */}
        {loading ? (
          <ProjectListSkeleton />
        ) : displayedSummaries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>単語帳がありません</Text>
            <Text style={styles.emptyText}>
              下部中央のスキャンボタンから単語帳を作成できます。
            </Text>
          </View>
        ) : (
          <View style={styles.projectList}>
            {displayedSummaries.map((summary) => (
              <ProjectCardRow
                key={summary.project.id}
                summary={summary}
                onPress={() => navigation.navigate('Project', { projectId: summary.project.id })}
              />
            ))}
          </View>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

    </SafeAreaView>
  );
}

// ---------- Project card matching iOS screenshot ----------

const ProjectCardRow = React.memo(function ProjectCardRow({
  summary,
  onPress,
}: {
  summary: ProjectSummary;
  onPress: () => void;
}) {
  const initial = summary.project.title.charAt(0) || '?';
  const bgColor = getThumbnailColor(summary.project.id);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <SolidCard style={styles.card}>
        <View style={styles.cardRow}>
          {/* Thumbnail */}
          <View style={[styles.thumbnail, { backgroundColor: bgColor }]}>
            <Text style={styles.thumbnailText}>{initial}</Text>
          </View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {summary.project.title}
            </Text>
            <View style={styles.wordCountRow}>
              <Text style={styles.wordCountNumber}>{summary.totalWords}</Text>
              <Text style={styles.wordCountLabel}> 語</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusDot}>
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <Text style={styles.statusText}>習得 {summary.masteredWords}</Text>
              </View>
              <View style={styles.statusDot}>
                <View style={[styles.dot, { backgroundColor: theme.warning }]} />
                <Text style={styles.statusText}>学習 {summary.learningWords}</Text>
              </View>
              <View style={styles.statusDot}>
                <View style={[styles.dot, { backgroundColor: theme.borderLight }]} />
                <Text style={styles.statusText}>未学習 {summary.newWords}</Text>
              </View>
            </View>
          </View>
        </View>
      </SolidCard>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  title: {
    fontFamily: 'NotoSansJP_900Black',
    fontSize: theme.fontSize.largeTitle,
    fontWeight: '900',
    color: theme.primaryText,
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: 'NotoSansJP_500Medium',
    fontSize: theme.fontSize.subheadline,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  sectionCount: {
    fontFamily: 'Lexend_700Bold',
    fontSize: theme.fontSize.subheadline,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: theme.fontSize.title2,
    fontWeight: '700',
    color: theme.primaryText,
  },
  emptyText: {
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: theme.fontSize.callout,
    color: theme.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
  },
  projectList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: 20,
    fontWeight: '700',
    color: theme.white,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 16,
    fontWeight: '700',
    color: theme.primaryText,
  },
  wordCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  wordCountNumber: {
    fontFamily: 'Lexend_900Black',
    fontSize: 22,
    fontWeight: '900',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },
  wordCountLabel: {
    fontFamily: 'Lexend_700Bold',
    fontSize: 13,
    fontWeight: '700',
    color: theme.secondaryText,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: 12,
    color: theme.secondaryText,
  },
});
