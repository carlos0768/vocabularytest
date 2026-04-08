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
import { useFocusEffect } from '@react-navigation/native';
import { Flame, GraduationCap } from 'lucide-react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { SolidCard, IconBadge, LoginGateView } from '../components/ui';
import { StatsScreenSkeleton } from '../components/ui/ScreenSkeleton';
import theme from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { fetchAllWordsForUser } from '../lib/db/fetch-all-words';
import { getDailyStats, getGuestUserId, getStreakDays, getWrongAnswers } from '../lib/utils';
import type { Word } from '../types';

interface DayMastery {
  label: string;
  count: number;
  isToday: boolean;
}

export function StatsScreen() {
  const { user, isAuthenticated, subscription, loading: authLoading } = useAuth();
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status]
  );

  interface StatsData {
    streakDays: number;
    todayMastered: number;
    todayAnswered: number;
    todayCorrect: number;
    masteredCount: number;
    reviewCount: number;
    newCount: number;
    wrongCount: number;
    totalWords: number;
    masteryHistory: DayMastery[];
  }

  const [statsData, setStatsData] = useState<StatsData>({
    streakDays: 0,
    todayMastered: 0,
    todayAnswered: 0,
    todayCorrect: 0,
    masteredCount: 0,
    reviewCount: 0,
    newCount: 0,
    wrongCount: 0,
    totalWords: 0,
    masteryHistory: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFirstLoadRef = useRef(true);

  const loadStats = useCallback(
    async (showSpinner = true) => {
      if (authLoading) return;
      if (showSpinner && isFirstLoadRef.current) setLoading(true);
      try {
        const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
        const isPro = subscription?.status === 'active';
        const [allWords, dailyStats, streak, wrongAnswers] = await Promise.all([
          isPro
            ? fetchAllWordsForUser(userId)
            : repository.getProjects(userId).then(async (projects) => {
                const words: Word[] = [];
                for (const p of projects) words.push(...(await repository.getWords(p.id)));
                return words;
              }),
          getDailyStats(),
          getStreakDays(),
          getWrongAnswers(),
        ]);

        // Single setState to avoid multiple re-renders after await
        setStatsData({
          masteredCount: allWords.filter((w) => w.status === 'mastered').length,
          reviewCount: allWords.filter((w) => w.status === 'review').length,
          newCount: allWords.filter((w) => w.status === 'new').length,
          totalWords: allWords.length,
          wrongCount: wrongAnswers.length,
          streakDays: streak,
          todayMastered: dailyStats.masteredCount,
          todayAnswered: dailyStats.todayCount,
          todayCorrect: dailyStats.correctCount,
          masteryHistory: buildMasteryHistory(allWords),
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        isFirstLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authLoading, isAuthenticated, repository, subscription?.status, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadStats();
      });
      return () => task.cancel();
    }, [loadStats])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadStats(false);
  }, [loadStats]);

  const { streakDays, todayMastered, todayAnswered, todayCorrect, masteredCount, reviewCount, newCount, wrongCount, totalWords, masteryHistory } = statsData;
  const masteryPercent = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

  // Guest gate
  if (!isAuthenticated && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>進歩</Text>
        <LoginGateView
          title="ログインが必要です"
          message="学習の統計を見るにはログインしてください。"
          onLogin={() => {}}
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatsScreenSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accentBlack} />
        }
      >
        <Text style={styles.title}>進歩</Text>

        {/* Summary widgets - 2 column */}
        <View style={styles.summaryRow}>
          <SolidCard style={styles.summaryCard}>
            <IconBadge
              icon={<Flame size={18} color="#f97316" />}
              size={42}
              backgroundColor="rgba(249,115,22,0.10)"
            />
            <Text style={styles.summaryValue}>{streakDays}日</Text>
            <Text style={styles.summaryLabel}>連続学習日数</Text>
          </SolidCard>
          <SolidCard style={styles.summaryCard}>
            <IconBadge
              icon={<GraduationCap size={18} color={theme.success} />}
              size={42}
              backgroundColor={theme.successBg}
            />
            <Text style={styles.summaryValue}>{todayMastered}語</Text>
            <Text style={styles.summaryLabel}>今日の習得</Text>
          </SolidCard>
        </View>

        {/* Mastery bar chart */}
        <SolidCard style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>暗記した単語数の推移</Text>
            <Text style={styles.chartSubtitle}>7日間</Text>
          </View>
          <MasteryBarChart data={masteryHistory} />
          <View style={styles.chartLegend}>
            <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
            <Text style={styles.legendText}>習得済み</Text>
          </View>
        </SolidCard>

        {/* Word stats card */}
        <SolidCard style={styles.statsCard}>
          <View style={styles.statsTop}>
            <DonutChart
              mastered={masteredCount}
              review={reviewCount}
              total={totalWords}
              percent={masteryPercent}
            />
            <View style={styles.statsRight}>
              <Text style={styles.statsMainValue}>{masteredCount}</Text>
              <Text style={styles.statsMainLabel}>語を習得</Text>
              <Text style={styles.statsSubLabel}>全{totalWords}語 / 復習{reviewCount}語</Text>
            </View>
          </View>

          {/* Distribution bar */}
          <View style={styles.distBar}>
            {masteredCount > 0 && (
              <View style={[styles.distSegment, { flex: masteredCount, backgroundColor: theme.success }]} />
            )}
            {reviewCount > 0 && (
              <View style={[styles.distSegment, { flex: reviewCount, backgroundColor: theme.chartBlue }]} />
            )}
            {newCount > 0 && (
              <View style={[styles.distSegment, { flex: newCount, backgroundColor: theme.border }]} />
            )}
          </View>

          {/* 2x2 metric grid */}
          <View style={styles.metricsGrid}>
            <MetricTile label="習得済み" value={masteredCount} color={theme.success} bg={theme.successBg} />
            <MetricTile label="復習中" value={reviewCount} color={theme.chartBlue} bg={theme.chartBlueBg} />
            <MetricTile label="未学習" value={newCount} color={theme.secondaryText} bg={theme.surfaceAlt} />
            <MetricTile label="間違い" value={wrongCount} color={theme.danger} bg={theme.dangerBg} />
          </View>
        </SolidCard>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------- Bar Chart (matching iOS StatsView bar chart) ----------

function MasteryBarChart({ data }: { data: DayMastery[] }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  // iOS uses UIScreen.main.bounds.height * 0.32
  const { height: screenHeight } = require('react-native').Dimensions.get('window');
  const chartHeight = Math.round(screenHeight * 0.28);
  const yAxisWidth = 36;
  const yLabels = [maxVal, Math.round(maxVal / 2), 0];
  const barCount = data.length;

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Y-axis */}
      <View style={{ width: yAxisWidth, height: chartHeight, justifyContent: 'space-between', paddingBottom: 20 }}>
        {yLabels.map((v, i) => (
          <Text key={i} style={styles.yLabel}>{v}</Text>
        ))}
      </View>

      {/* Bars — flex layout, no fixed SVG width */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartHeight - 20, gap: 8 }}>
          {data.map((d, i) => {
            const barHeight = maxVal > 0 ? (d.count / maxVal) * (chartHeight - 40) : 0;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <View
                  style={{
                    width: '70%',
                    maxWidth: 32,
                    height: Math.max(barHeight, 3),
                    borderRadius: 4,
                    backgroundColor: d.isToday ? theme.success : 'rgba(33,197,89,0.65)',
                  }}
                />
              </View>
            );
          })}
        </View>
        {/* X-axis labels */}
        <View style={{ flexDirection: 'row', marginTop: 6, gap: 8 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.xLabel} numberOfLines={1}>
                {d.label.slice(-5)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ---------- Donut Chart ----------

function DonutChart({
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
  const size = 84;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const masteredFrac = total > 0 ? mastered / total : 0;
  const reviewFrac = total > 0 ? review / total : 0;
  const masteredDash = circumference * masteredFrac;
  const reviewDash = circumference * reviewFrac;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke={theme.border} strokeWidth={strokeWidth} fill="none" />
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
            stroke={theme.chartBlue} strokeWidth={strokeWidth} fill="none"
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

// ---------- Metric Tile ----------

function MetricTile({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.metricTile, { backgroundColor: bg }]}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ---------- Helpers ----------

function buildMasteryHistory(allWords: Word[]): DayMastery[] {
  const today = startOfDay(new Date());
  const history: DayMastery[] = [];

  // 前日5日 + 今日 + 翌日 = 7日間
  for (let offset = -5; offset <= 1; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const count = offset <= 0
      ? allWords.filter((w) => {
          if (w.status !== 'mastered') return false;
          const d = w.lastReviewedAt ? new Date(w.lastReviewedAt) : new Date(w.createdAt);
          return d >= date && d < nextDate;
        }).length
      : 0; // 翌日はまだデータなし

    history.push({
      label: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
      count,
      isToday: offset === 0,
    });
  }

  return history;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 20,
  },
  title: {
    fontSize: theme.fontSize.title1,
    fontWeight: '700',
    color: theme.primaryText,
    paddingTop: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Summary cards (iOS: padding 16, minHeight 146, spacing 12, left-aligned) ──
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 146,
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryValue: {
    fontSize: 30,
    fontWeight: '700',
    color: theme.primaryText,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.secondaryText,
  },

  // ── Bar chart card (iOS: padding 16, title 15pt bold, spacing 10) ──
  chartCard: {
    padding: 16,
    gap: 10,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primaryText,
  },
  chartSubtitle: {
    fontSize: 12,
    color: theme.secondaryText,
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: theme.secondaryText,
  },
  yLabel: {
    fontSize: 10,
    color: theme.mutedText,
    textAlign: 'right',
  },
  xLabel: {
    fontSize: 9,
    color: theme.mutedText,
    textAlign: 'center',
  },

  // ── Word stats card (iOS: hPad 16, vPad 22, minHeight 192, gap 14) ──
  statsCard: {
    paddingHorizontal: 16,
    paddingVertical: 22,
    minHeight: 192,
    gap: 14,
  },
  statsTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statsRight: {
    flex: 1,
    gap: 4,
  },
  statsMainValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.primaryText,
  },
  statsMainLabel: {
    fontSize: 13,
    color: theme.secondaryText,
  },
  statsSubLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.mutedText,
  },

  // ── Donut (iOS: 84x84, stroke 6, center text 15pt bold + 10pt) ──
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    gap: 1,
  },
  donutPercent: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primaryText,
    fontVariant: ['tabular-nums'],
  },
  donutLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: theme.secondaryText,
  },

  // ── Distribution bar (iOS: height 14, radius 7) ──
  distBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: theme.border,
  },
  distSegment: {
    height: 14,
  },

  // ── 2x2 metric grid (iOS: 2 cols, spacing 10) ──
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '47%',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.secondaryText,
  },
});
