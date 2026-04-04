import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ArrowLeft, Globe, Users } from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import {
  fetchSharedProjects,
  type SharedProjectSummary,
} from '../lib/shared-projects';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SharedProjectsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { session, isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publicProjects, setPublicProjects] = useState<SharedProjectSummary[]>([]);
  const [ownedProjects, setOwnedProjects] = useState<SharedProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated || !session?.access_token) {
        setLoading(false);
        return;
      }

      if (showSpinner) setLoading(true);
      setError(null);

      try {
        const result = await fetchSharedProjects(session.access_token);
        setPublicProjects(result.publicProjects ?? []);
        setOwnedProjects(result.owned ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '取得に失敗しました。';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, session?.access_token],
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(false);
  }, [loadData]);

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>共有単語帳</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loginGate}>
          <Users size={40} color={colors.gray[300]} />
          <Text style={styles.loginGateTitle}>ログインが必要です</Text>
          <Text style={styles.loginGateText}>
            共有単語帳を閲覧するにはログインしてください。
          </Text>
          <View style={styles.loginGateButtons}>
            <Button variant="secondary" onPress={() => navigation.navigate('Signup')}>
              新規登録
            </Button>
            <Button onPress={() => navigation.navigate('Login')}>ログイン</Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>共有単語帳</Text>
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
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>共有単語帳を読み込み中...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Button size="sm" onPress={() => void loadData()}>
              再読み込み
            </Button>
          </View>
        ) : (
          <>
            {ownedProjects.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>あなたの公開単語帳</Text>
                {ownedProjects.map((p) => (
                  <SharedProjectCard
                    key={p.id}
                    project={p}
                    onPress={() =>
                      navigation.navigate('SharedProjectDetail', { projectId: p.id })
                    }
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>公開単語帳</Text>
              {publicProjects.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Globe size={32} color={colors.gray[300]} />
                  <Text style={styles.emptyText}>公開されている単語帳はまだありません。</Text>
                </View>
              ) : (
                publicProjects.map((p) => (
                  <SharedProjectCard
                    key={p.id}
                    project={p}
                    onPress={() =>
                      navigation.navigate('SharedProjectDetail', { projectId: p.id })
                    }
                  />
                ))
              )}
            </View>
          </>
        )}
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
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{project.title}</Text>
          <Text style={styles.cardMeta}>
            {project.wordCount}語
            {project.ownerName ? ` · ${project.ownerName}` : ''}
          </Text>
        </View>
        <View
          style={[
            styles.roleBadge,
            project.accessRole === 'owner' ? styles.roleBadgeOwner : styles.roleBadgeViewer,
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              project.accessRole === 'owner'
                ? styles.roleBadgeTextOwner
                : styles.roleBadgeTextViewer,
            ]}
          >
            {project.accessRole === 'owner' ? 'owner' : 'viewer'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    gap: 20,
    paddingBottom: 40,
  },
  loginGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  loginGateTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  loginGateText: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
  },
  loginGateButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  loadingWrap: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  errorCard: {
    backgroundColor: colors.red[50],
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.red[200],
    gap: 12,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.red[700],
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  cardMeta: {
    fontSize: 13,
    color: colors.gray[500],
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  roleBadgeOwner: {
    backgroundColor: colors.primary[50],
  },
  roleBadgeViewer: {
    backgroundColor: colors.gray[100],
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  roleBadgeTextOwner: {
    color: colors.primary[700],
  },
  roleBadgeTextViewer: {
    color: colors.gray[600],
  },
});
