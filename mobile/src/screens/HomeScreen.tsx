import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { ChevronRight, Flame, LogIn } from 'lucide-react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { SolidCard, IconBadge } from '../components/ui';
import { HomeScreenSkeleton } from '../components/ui/ScreenSkeleton';
import theme, { getThumbnailColor } from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { migrateLocalDataToCloudIfNeeded } from '../lib/db/migration';
import { fetchAllWordsForUser } from '../lib/db/fetch-all-words';
import { getDailyStats, getGuestUserId, getStreakDays } from '../lib/utils';
import type { HomeStackParamList, Project, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList>;

interface ProjectSummary {
  project: Project;
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  newWords: number;
}

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    subscription,
    isAuthenticated,
    isPro,
    loading: authLoading,
  } = useAuth();

  interface HomeData {
    projectSummaries: ProjectSummary[];
    totalWords: number;
    masteredCount: number;
    reviewCount: number;
    newCount: number;
    streakDays: number;
    dueWordCount: number;
    reviewCompletedCount: number;
  }

  const [data, setData] = useState<HomeData>({
    projectSummaries: [],
    totalWords: 0,
    masteredCount: 0,
    reviewCount: 0,
    newCount: 0,
    streakDays: 0,
    dueWordCount: 0,
    reviewCompletedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (authLoading) return;
      // Only show spinner on first load; subsequent loads keep stale data visible
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

        const mastered = allWords.filter((w) => w.status === 'mastered').length;
        const review = allWords.filter((w) => w.status === 'review').length;
        const newW = allWords.filter((w) => w.status === 'new').length;
        const due = allWords.filter((w) => w.status === 'review').length;

        const [dailyStats, streak] = await Promise.all([
          getDailyStats(),
          getStreakDays(),
        ]);

        // Single setState to avoid multiple re-renders after await
        setData({
          projectSummaries: summaries,
          totalWords: allWords.length,
          masteredCount: mastered,
          reviewCount: review,
          newCount: newW,
          dueWordCount: due,
          reviewCompletedCount: dailyStats.masteredCount,
          streakDays: streak,
        });
      } catch (error) {
        console.error('Failed to load home data:', error);
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
      // Defer data fetch until navigation transition animation completes
      const task = InteractionManager.runAfterInteractions(() => {
        void loadData();
      });
      return () => task.cancel();
    }, [loadData])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(false);
  }, [loadData]);

  const { projectSummaries, totalWords, masteredCount, reviewCount, newCount, streakDays, dueWordCount, reviewCompletedCount } = data;
  const masteryPercent = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

  // Navigate to first project's quiz for review
  const handleStartReview = useCallback(() => {
    if (projectSummaries.length > 0) {
      navigation.navigate('Quiz', { projectId: projectSummaries[0].project.id });
    }
  }, [navigation, projectSummaries]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <HomeScreenSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accentBlack}
          />
        }
      >
        {/* Logo title */}
        <Text style={styles.logo}>MERKEN</Text>

        {/* Two-column cards */}
        <View style={styles.twoCol}>
          {/* Left: Today's Goal */}
          <SolidCard style={styles.goalCard}>
            <Text style={styles.goalLabel}>今日の目標</Text>
            {dueWordCount > 0 ? (
              <>
                <View style={styles.goalValueRow}>
                  <Text style={styles.goalValue}>{dueWordCount}</Text>
                  <Text style={styles.goalSuffix}>語</Text>
                </View>
                <Text style={styles.goalProgress}>
                  {reviewCompletedCount} / {dueWordCount + reviewCompletedCount} 完了
                </Text>
                <View style={{ flex: 1 }} />
                {projectSummaries.length > 0 && (
                  <TouchableOpacity onPress={handleStartReview} activeOpacity={0.7}>
                    <View style={styles.goalAction}>
                      <Text style={styles.goalActionText}>復習を始める</Text>
                      <ChevronRight size={15} color={theme.accentBlack} strokeWidth={2.5} />
                    </View>
                  </TouchableOpacity>
                )}
              </>
            ) : reviewCompletedCount > 0 ? (
              <>
                <Text style={styles.goalComplete}>完了！</Text>
                <Text style={styles.goalProgress}>
                  {reviewCompletedCount} / {reviewCompletedCount} 完了
                </Text>
              </>
            ) : (
              <Text style={styles.goalNone}>復習待ちなし</Text>
            )}
          </SolidCard>

          {/* Right: Mastery Donut */}
          <SolidCard style={styles.donutCard}>
            <MiniDonut
              mastered={masteredCount}
              review={reviewCount}
              total={totalWords}
              percent={masteryPercent}
            />
            <View style={styles.legendCol}>
              <LegendItem color={theme.success} label="習得" count={masteredCount} />
              <LegendItem color={theme.warning} label="学習中" count={reviewCount} />
              <LegendItem color={theme.borderLight} label="未学習" count={newCount} />
            </View>
          </SolidCard>
        </View>

        {/* Mini stats row removed per user request */}

        {/* Projects section */}
        {projectSummaries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>📖</Text>
            </View>
            <Text style={styles.emptyTitle}>単語帳がありません</Text>
            <Text style={styles.emptyText}>
              右下のスキャンボタンから{'\n'}ノートやプリントを撮影しましょう。
            </Text>
            {!isAuthenticated && (
              <TouchableOpacity
                style={styles.loginChip}
                onPress={() => (navigation as any).getParent()?.navigate('SettingsTab', { screen: 'Login' })}
                activeOpacity={0.7}
              >
                <LogIn size={14} color={theme.accentBlack} strokeWidth={2} />
                <Text style={styles.loginChipText}>設定でログイン・登録</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.projectsSection}>
            {/* My Projects */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>マイ単語帳</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ProjectList')} activeOpacity={0.7}>
                <Text style={styles.manageBtn}>管理</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.projectList}>
              {projectSummaries.map((s) => (
                <FeaturedProjectCard
                  key={s.project.id}
                  summary={s}
                  onPress={() => navigation.navigate('Project', { projectId: s.project.id })}
                />
              ))}
            </View>
          </View>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Mini Donut ----------

function MiniDonut({
  mastered,
  review,
  total,
  percent,
}: {
  mastered: number;
  review: number;
  total: number;
  percent: number;
}) {
  const size = 96;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const masteredFrac = total > 0 ? mastered / total : 0;
  const reviewFrac = total > 0 ? review / total : 0;
  const masteredDash = circumference * masteredFrac;
  const reviewDash = circumference * reviewFrac;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke={theme.borderLight} strokeWidth={strokeWidth} fill="none" />
        {masteredFrac > 0 && (
          <SvgCircle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={theme.success} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${masteredDash} ${circumference - masteredDash}`}
            strokeLinecap="butt" rotation={-90} origin={`${size / 2}, ${size / 2}`}
          />
        )}
        {reviewFrac > 0 && (
          <SvgCircle
            cx={size / 2} cy={size / 2} r={radius}
            stroke={theme.warning} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${reviewDash} ${circumference - reviewDash}`}
            strokeDashoffset={-masteredDash}
            strokeLinecap="butt" rotation={-90} origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutPercent}>{percent}%</Text>
        <Text style={styles.donutLabel}>習得</Text>
      </View>
    </View>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendItemLabel}>{label}</Text>
      <Text style={styles.legendItemCount}>{count}</Text>
    </View>
  );
}

function MiniStat({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <View style={styles.miniStatItem}>
      <View style={styles.miniStatValueRow}>
        {icon}
        <Text style={styles.miniStatValue}>{value}</Text>
      </View>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

// ---------- Featured Project Card ----------

const FeaturedProjectCard = React.memo(function FeaturedProjectCard({
  summary,
  onPress,
}: {
  summary: ProjectSummary;
  onPress: () => void;
}) {
  const title = summary.project.title ?? '無題';
  const initial = title.charAt(0) || '?';
  const bgColor = getThumbnailColor(summary.project.id);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <SolidCard style={styles.projectCard}>
        <View style={styles.projectRow}>
          <View style={[styles.thumbnail, { backgroundColor: bgColor }]}>
            <Text style={styles.thumbnailText}>{initial}</Text>
          </View>
          <View style={styles.projectInfo}>
            <Text style={styles.projectTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.wordCountRow}>
              <Text style={styles.wordCountNumber}>{summary.totalWords}</Text>
              <Text style={styles.wordCountSuffix}> 語</Text>
            </View>
            <View style={styles.statusRow}>
              <StatusDot color={theme.success} label={`習得 ${summary.masteredWords}`} />
              <StatusDot color={theme.chartBlue} label={`学習 ${summary.learningWords}`} />
              <StatusDot color={theme.borderLight} label={`未学習 ${summary.newWords}`} />
            </View>
          </View>
        </View>
      </SolidCard>
    </TouchableOpacity>
  );
});

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.statusDotRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.statusDotText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingBottom: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  logo: {
    fontSize: 31.2,
    fontWeight: '900',
    color: theme.primaryText,
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Two-column cards
  twoCol: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  goalCard: {
    flex: 1,
    minHeight: 150,
    padding: 14,
  },
  goalLabel: {
    fontSize: 12,
    color: theme.secondaryText,
    marginBottom: 6,
  },
  goalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  goalValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.accentBlack,
    fontVariant: ['tabular-nums'],
  },
  goalSuffix: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.primaryText,
  },
  goalProgress: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.secondaryText,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  goalComplete: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.success,
    marginTop: 4,
  },
  goalNone: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.secondaryText,
    marginTop: 8,
  },
  goalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  goalActionText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.accentBlack,
  },

  // Donut card
  donutCard: {
    flex: 1,
    minHeight: 150,
    padding: 14,
    alignItems: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutPercent: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },
  donutLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  legendCol: {
    gap: 5,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendItemLabel: {
    fontSize: 10,
    color: theme.secondaryText,
    flex: 1,
  },
  legendItemCount: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },

  // Mini stats
  miniStats: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  miniStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  miniStatValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },
  miniStatLabel: {
    fontSize: 10,
    color: theme.mutedText,
  },
  miniDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.borderLight,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.chartBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.primaryText,
  },
  emptyText: {
    fontSize: 14,
    color: theme.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
  },
  loginChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(19,127,236,0.08)',
  },
  loginChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accentBlack,
  },

  // Projects section
  projectsSection: {
    paddingHorizontal: 16,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.primaryText,
  },
  manageBtn: {
    fontSize: 14,
    color: theme.accentBlack,
    fontWeight: '500',
  },
  projectList: {
    gap: 10,
  },
  projectCard: {
    padding: 16,
  },
  projectRow: {
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
    fontSize: 20,
    fontWeight: '700',
    color: theme.white,
  },
  projectInfo: {
    flex: 1,
    gap: 4,
  },
  projectTitle: {
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
    fontSize: 22,
    fontWeight: '900',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },
  wordCountSuffix: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.secondaryText,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotText: {
    fontSize: 12,
    color: theme.secondaryText,
  },
});
