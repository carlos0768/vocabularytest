import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ArrowLeft, Flame, GraduationCap } from 'lucide-react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { fetchAllWordsForUser } from '../lib/db/fetch-all-words';
import { getDailyStats, getGuestUserId, getStreakDays, getWrongAnswers } from '../lib/utils';
import type { RootStackParamList, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface DayMastery {
  label: string;
  count: number;
}

export function StatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isAuthenticated, subscription, loading: authLoading } = useAuth();
  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [todayMastered, setTodayMastered] = useState(0);
  const [todayAnswered, setTodayAnswered] = useState(0);
  const [todayCorrect, setTodayCorrect] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [masteryHistory, setMasteryHistory] = useState<DayMastery[]>([]);

  const loadStats = useCallback(
    async (showSpinner = true) => {
      if (authLoading) return;
      if (showSpinner) setLoading(true);

      try {
        const userId =
          isAuthenticated && user?.id ? user.id : await getGuestUserId();
        const isPro = subscription?.status === 'active';
        const [allWords, dailyStats, streak, wrongAnswers] = await Promise.all([
          isPro
            ? fetchAllWordsForUser(userId)
            : repository.getProjects(userId).then(async (projects) => {
                const words: Word[] = [];
                for (const p of projects) {
                  words.push(...(await repository.getWords(p.id)));
                }
                return words;
              }),
          getDailyStats(),
          getStreakDays(),
          getWrongAnswers(),
        ]);

        const mastered = allWords.filter((w) => w.status === 'mastered').length;
        const review = allWords.filter((w) => w.status === 'review').length;
        const newW = allWords.filter((w) => w.status === 'new').length;

        setMasteredCount(mastered);
        setReviewCount(review);
        setNewCount(newW);
        setTotalWords(allWords.length);
        setWrongCount(wrongAnswers.length);

        setStreakDays(streak);
        setTodayMastered(dailyStats.masteredCount);
        setTodayAnswered(dailyStats.todayCount);
        setTodayCorrect(dailyStats.correctCount);

        setMasteryHistory(buildMasteryHistory(allWords));
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authLoading, isAuthenticated, repository, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadStats(false);
  }, [loadStats]);

  const masteryPercent = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;
  const accuracyPercent =
    todayAnswered > 0 ? Math.round((todayCorrect / todayAnswered) * 100) : 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={styles.loadingText}>統計を読み込み中...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>進歩</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary[600]}
          />
        }
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Flame size={18} color={colors.orange[600]} />
            </View>
            <Text style={styles.summaryValue}>{streakDays}</Text>
            <Text style={styles.summaryLabel}>連続学習日数</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: colors.emerald[50] }]}>
              <GraduationCap size={18} color={colors.emerald[600]} />
            </View>
            <Text style={styles.summaryValue}>{todayMastered}</Text>
            <Text style={styles.summaryLabel}>今日の習得</Text>
          </View>
        </View>

        {todayAnswered > 0 ? (
          <View style={styles.todayCard}>
            <Text style={styles.todayTitle}>今日の学習</Text>
            <View style={styles.todayRow}>
              <TodayMetric label="回答数" value={todayAnswered} />
              <TodayMetric label="正解数" value={todayCorrect} />
              <TodayMetric label="正答率" value={`${accuracyPercent}%`} />
            </View>
          </View>
        ) : null}

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>習得推移（14日間）</Text>
          <MasteryChart data={masteryHistory} />
        </View>

        <View style={styles.donutCard}>
          <View style={styles.donutRow}>
            <DonutChart
              mastered={masteredCount}
              review={reviewCount}
              newWords={newCount}
              total={totalWords}
              percent={masteryPercent}
            />
            <View style={styles.legendColumn}>
              <LegendItem color={colors.emerald[500]} label="習得" count={masteredCount} />
              <LegendItem color={colors.primary[500]} label="学習中" count={reviewCount} />
              <LegendItem color={colors.gray[300]} label="未学習" count={newCount} />
            </View>
          </View>
        </View>

        <View style={styles.tilesRow}>
          <StatTile
            label="習得済み"
            value={masteredCount}
            color={colors.emerald[600]}
            bg={colors.emerald[50]}
          />
          <StatTile
            label="復習中"
            value={reviewCount}
            color={colors.primary[600]}
            bg={colors.primary[50]}
          />
        </View>
        <View style={styles.tilesRow}>
          <StatTile
            label="未学習"
            value={newCount}
            color={colors.gray[600]}
            bg={colors.gray[100]}
          />
          <StatTile
            label="間違い"
            value={wrongCount}
            color={colors.red[600]}
            bg={colors.red[50]}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TodayMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.todayMetric}>
      <Text style={styles.todayMetricValue}>{value}</Text>
      <Text style={styles.todayMetricLabel}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendCount}>{count}</Text>
    </View>
  );
}

function StatTile({
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
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function DonutChart({
  mastered,
  review,
  total,
  percent,
}: {
  mastered: number;
  review: number;
  newWords: number;
  total: number;
  percent: number;
}) {
  const size = 120;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const masteredFrac = total > 0 ? mastered / total : 0;
  const reviewFrac = total > 0 ? review / total : 0;

  const masteredDash = circumference * masteredFrac;
  const reviewDash = circumference * reviewFrac;
  const masteredOffset = 0;
  const reviewOffset = -(masteredDash);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.gray[200]}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {masteredFrac > 0 ? (
          <SvgCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.emerald[500]}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${masteredDash} ${circumference - masteredDash}`}
            strokeDashoffset={masteredOffset}
            strokeLinecap="butt"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
        {reviewFrac > 0 ? (
          <SvgCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.primary[500]}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${reviewDash} ${circumference - reviewDash}`}
            strokeDashoffset={reviewOffset}
            strokeLinecap="butt"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutPercent}>{percent}%</Text>
        <Text style={styles.donutPercentLabel}>習得</Text>
      </View>
    </View>
  );
}

function MasteryChart({ data }: { data: DayMastery[] }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const chartWidth = 300;
  const chartHeight = 120;
  const paddingLeft = 30;
  const paddingBottom = 24;
  const drawWidth = chartWidth - paddingLeft;
  const drawHeight = chartHeight - paddingBottom;

  const points = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * drawWidth;
    const y = drawHeight - (d.count / maxVal) * drawHeight;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${drawHeight} L${points[0].x},${drawHeight} Z`;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.emerald[400]} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.emerald[400]} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#areaGrad)" />
        <Path d={linePath} stroke={colors.emerald[500]} strokeWidth={2.5} fill="none" />
        {points.map((p, i) => (
          <SvgCircle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={colors.emerald[500]}
          />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        {data.map((d, i) =>
          i % 3 === 0 || i === data.length - 1 ? (
            <Text key={i} style={styles.chartLabelText}>
              {d.label}
            </Text>
          ) : (
            <Text key={i} style={styles.chartLabelText}>
              {''}
            </Text>
          ),
        )}
      </View>
    </View>
  );
}

function buildMasteryHistory(allWords: Word[]): DayMastery[] {
  const calendar = new Date();
  const today = startOfDay(calendar);
  const history: DayMastery[] = [];

  for (let offset = -13; offset <= 0; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const count = allWords.filter((w) => {
      if (w.status !== 'mastered') return false;
      const masteryDate = w.lastReviewedAt ? new Date(w.lastReviewedAt) : new Date(w.createdAt);
      return masteryDate >= date && masteryDate < nextDate;
    }).length;

    history.push({
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count,
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
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.gray[900],
  },
  headerSpacer: {
    width: 42,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    gap: 8,
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.orange[50],
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.gray[900],
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
  },
  todayCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  todayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  todayMetric: {
    alignItems: 'center',
    gap: 4,
  },
  todayMetricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.gray[900],
  },
  todayMetricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray[500],
  },
  chartCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 14,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 300,
    paddingLeft: 30,
    marginTop: 4,
  },
  chartLabelText: {
    fontSize: 10,
    color: colors.gray[400],
    width: 28,
    textAlign: 'center',
  },
  donutCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutPercent: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.gray[900],
  },
  donutPercentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray[500],
  },
  legendColumn: {
    flex: 1,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 14,
    color: colors.gray[600],
    flex: 1,
  },
  legendCount: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray[900],
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[600],
  },
});
