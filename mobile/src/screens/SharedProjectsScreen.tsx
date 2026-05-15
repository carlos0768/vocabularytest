import React, { useCallback, useState } from 'react';
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
import { ChevronRight, Globe, Users } from 'lucide-react-native';
import { SolidCard, LoginGateView, Button } from '../components/ui';
import theme, { getThumbnailColor } from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import {
  fetchSharedProjects,
  loadCachedSharedProjects,
  type SharedProjectSummary,
} from '../lib/shared-projects';
import type { SharedStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<SharedStackParamList>;

export function SharedProjectsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { session, user, isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publicProjects, setPublicProjects] = useState<SharedProjectSummary[]>([]);
  const [ownedProjects, setOwnedProjects] = useState<SharedProjectSummary[]>([]);
  const [joinedProjects, setJoinedProjects] = useState<SharedProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cacheScope = user?.id ?? 'anonymous';

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated || !session?.access_token) {
        setLoading(false);
        return;
      }

      const cached = await loadCachedSharedProjects(cacheScope);
      if (cached) {
        setOwnedProjects(cached.owned ?? []);
        setJoinedProjects(cached.joined ?? []);
        setPublicProjects(cached.publicProjects ?? []);
        setLoading(false);
      } else if (showSpinner) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchSharedProjects(session.access_token, cacheScope);
        setPublicProjects(result.publicProjects ?? []);
        setOwnedProjects(result.owned ?? []);
        setJoinedProjects(result.joined ?? []);
      } catch (e) {
        if (!cached) setError(e instanceof Error ? e.message : '取得に失敗しました。');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheScope, isAuthenticated, session?.access_token]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(false);
  }, [loadData]);

  // Guest: show login gate
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerBlock}>
          <Text style={styles.kicker}>SHARED BOOKSHELF</Text>
          <Text style={styles.title}>共有単語帳</Text>
        </View>
        <LoginGateView
          title="ログインが必要です"
          message="共有単語帳を閲覧するにはログインしてください。"
          onLogin={() => {
            // Navigate to settings tab login — handled by parent navigator
            (navigation as any).getParent()?.navigate('SettingsTab', { screen: 'Login' });
          }}
        />
      </SafeAreaView>
    );
  }

  // Deduplicate: owned projects may also appear in public list
  const seen = new Set<string>();
  const allProjects: SharedProjectSummary[] = [];
  for (const p of [...ownedProjects, ...joinedProjects, ...publicProjects]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      allProjects.push(p);
    }
  }
  const totalCount = allProjects.length;

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
        <View style={styles.headerBlock}>
          <Text style={styles.kicker}>SHARED BOOKSHELF</Text>
          <Text style={styles.title}>共有単語帳</Text>
        </View>

        {/* Context header */}
        <View style={styles.contextHeader}>
          <Text style={styles.contextLabel}>Webと同じ共有ライブラリ</Text>
          <View style={styles.contextCountWrap}>
            {loading ? (
              <ActivityIndicator size="small" color={theme.secondaryText} />
            ) : (
              <Text style={styles.contextCount}>{totalCount}件</Text>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={theme.secondaryText} />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Button size="sm" onPress={() => void loadData()}>
              再読み込み
            </Button>
          </View>
        ) : allProjects.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Globe size={40} color={theme.mutedText} />
            <Text style={styles.emptyText}>公開されている単語帳はまだありません。</Text>
          </View>
        ) : (
          <View style={styles.projectList}>
            {allProjects.map((p, i) => (
              <SharedProjectCard
                key={p.id ?? `project-${i}`}
                project={p}
                onPress={() => navigation.navigate('SharedProjectDetail', { projectId: p.id })}
              />
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SharedProjectCard({
  project,
  onPress,
}: {
  project: SharedProjectSummary;
  onPress: () => void;
}) {
  const bgColor = getThumbnailColor(project.id);
  const title = project.title ?? '無題';
  const initial = title.charAt(0) || '?';
  const badgeLabel = project.accessRole === 'owner' ? '公開中' : project.accessRole === 'editor' ? '編集可' : '共有中';

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
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
              <View style={[styles.badge, project.accessRole === 'owner' ? styles.badgeOwner : styles.badgeViewer]}>
                <Text style={[styles.badgeText, project.accessRole === 'owner' ? styles.badgeTextOwner : null]}>
                  {badgeLabel}
                </Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              {project.ownerName ? (
                <View style={styles.metaItem}>
                  <Users size={11} color={theme.mutedText} />
                  <Text style={styles.metaText}>{project.ownerName}</Text>
                </View>
              ) : null}
              <Text style={styles.metaText}>{project.wordCount}語</Text>
            </View>
          </View>

          <ChevronRight size={16} color={theme.mutedText} />
        </View>
      </SolidCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingBottom: 20,
    paddingTop: 4,
  },
  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 2,
  },
  kicker: {
    fontFamily: 'NotoSansJP_900Black',
    fontSize: 11,
    fontWeight: '900',
    color: theme.mutedText,
    letterSpacing: 0,
  },
  title: {
    fontFamily: 'NotoSansJP_900Black',
    fontSize: theme.fontSize.title1,
    fontWeight: '900',
    color: theme.primaryText,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  contextLabel: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: theme.fontSize.subheadline,
    fontWeight: '700',
    color: theme.secondaryText,
  },
  contextCountWrap: {
    minWidth: 30,
    alignItems: 'flex-end',
  },
  contextCount: {
    fontFamily: 'Lexend_700Bold',
    fontSize: theme.fontSize.subheadline,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorCard: {
    marginHorizontal: 16,
    backgroundColor: theme.dangerBg,
    borderRadius: theme.radius.lg,
    padding: 18,
    gap: 12,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: theme.fontSize.callout,
    color: theme.danger,
    textAlign: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 36,
    borderWidth: 1.25,
    borderColor: theme.solidBorder,
    borderRadius: theme.radius.md,
    backgroundColor: theme.surface,
    gap: 12,
  },
  emptyText: {
    fontFamily: 'NotoSansJP_400Regular',
    fontSize: theme.fontSize.callout,
    color: theme.secondaryText,
  },
  projectList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    padding: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 58,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.25,
    borderColor: theme.solidInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: 24,
    fontWeight: '700',
    color: theme.white,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 17,
    fontWeight: '700',
    color: theme.primaryText,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.solidSm,
    borderWidth: 1.25,
    borderColor: theme.solidInk,
  },
  badgeOwner: {
    backgroundColor: theme.accentGreenBg,
  },
  badgeViewer: {
    backgroundColor: theme.surface,
  },
  badgeText: {
    fontFamily: 'NotoSansJP_600SemiBold',
    fontSize: 11,
    fontWeight: '600',
    color: theme.secondaryText,
  },
  badgeTextOwner: {
    color: theme.accentGreenInk,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontFamily: 'NotoSansJP_500Medium',
    fontSize: theme.fontSize.footnote,
    fontWeight: '500',
    color: theme.mutedText,
  },
});
