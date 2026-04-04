import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ArrowLeft, Download, Users } from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { fetchSharedProjectDetail, type SharedProjectDetail } from '../lib/shared-projects';
import { getGuestUserId } from '../lib/utils';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SharedProjectDetailRouteProp = RouteProp<RootStackParamList, 'SharedProjectDetail'>;

export function SharedProjectDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SharedProjectDetailRouteProp>();
  const { projectId } = route.params;
  const { session, user, isAuthenticated, subscription } = useAuth();

  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<SharedProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadDetail = useCallback(
    async (showSpinner = true) => {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      if (showSpinner) setLoading(true);
      setError(null);

      try {
        const data = await fetchSharedProjectDetail(projectId, session.access_token);
        setDetail(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : '取得に失敗しました。');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, session?.access_token],
  );

  useFocusEffect(
    useCallback(() => {
      void loadDetail();
    }, [loadDetail]),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDetail(false);
  }, [loadDetail]);

  const handleImport = useCallback(async () => {
    if (!detail) return;

    Alert.alert(
      '単語帳として追加',
      `「${detail.project.title}」をローカルにコピーしますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '追加',
          onPress: async () => {
            setImporting(true);
            try {
              const userId =
                isAuthenticated && user?.id ? user.id : await getGuestUserId();
              const createdProject = await repository.createProject({
                userId,
                title: detail.project.title,
                importedFromShareId: projectId,
              });
              await repository.createWords(
                detail.words.map((w) => ({
                  projectId: createdProject.id,
                  english: w.english,
                  japanese: w.japanese,
                  distractors: [],
                  pronunciation: w.pronunciation,
                  exampleSentence: w.exampleSentence,
                  exampleSentenceJa: w.exampleSentenceJa,
                })),
              );

              Alert.alert('完了', `「${detail.project.title}」を追加しました。`, [
                {
                  text: '開く',
                  onPress: () =>
                    navigation.navigate('Project', { projectId: createdProject.id }),
                },
                { text: 'OK' },
              ]);
            } catch (e) {
              Alert.alert(
                'エラー',
                e instanceof Error ? e.message : '取り込みに失敗しました。',
              );
            } finally {
              setImporting(false);
            }
          },
        },
      ],
    );
  }, [detail, isAuthenticated, navigation, projectId, repository, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detail?.project.title ?? '共有単語帳'}
        </Text>
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
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Button size="sm" onPress={() => void loadDetail()}>
              再読み込み
            </Button>
          </View>
        ) : detail ? (
          <>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>{detail.project.title}</Text>
              <View style={styles.infoMeta}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{detail.words.length}語</Text>
                </View>
                <View style={styles.metaPill}>
                  <Users size={12} color={colors.gray[600]} />
                  <Text style={styles.metaPillText}>
                    {detail.collaboratorCount}人
                  </Text>
                </View>
                <View
                  style={[
                    styles.metaPill,
                    detail.accessRole === 'owner'
                      ? styles.metaPillOwner
                      : styles.metaPillViewer,
                  ]}
                >
                  <Text
                    style={[
                      styles.metaPillText,
                      detail.accessRole === 'owner'
                        ? styles.metaPillTextOwner
                        : styles.metaPillTextViewer,
                    ]}
                  >
                    {detail.accessRole}
                  </Text>
                </View>
              </View>
            </View>

            <Button
              onPress={handleImport}
              loading={importing}
              icon={<Download size={16} color={colors.white} />}
            >
              単語帳として追加
            </Button>

            <Text style={styles.wordListTitle}>単語一覧</Text>
            {detail.words.map((w, i) => (
              <View key={w.id ?? i} style={styles.wordRow}>
                <View style={styles.wordIndex}>
                  <Text style={styles.wordIndexText}>{i + 1}</Text>
                </View>
                <View style={styles.wordContent}>
                  <Text style={styles.wordEnglish}>{w.english}</Text>
                  <Text style={styles.wordJapanese}>{w.japanese}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.gray[900],
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerSpacer: {
    width: 42,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
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
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  infoMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
  },
  metaPillOwner: {
    backgroundColor: colors.primary[50],
  },
  metaPillViewer: {
    backgroundColor: colors.gray[100],
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[600],
  },
  metaPillTextOwner: {
    color: colors.primary[700],
  },
  metaPillTextViewer: {
    color: colors.gray[600],
  },
  wordListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 12,
  },
  wordIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  wordIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gray[500],
  },
  wordContent: {
    flex: 1,
    gap: 2,
  },
  wordEnglish: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  wordJapanese: {
    fontSize: 13,
    color: colors.gray[500],
  },
});
