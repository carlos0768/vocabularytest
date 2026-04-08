import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// SVG import removed — header no longer uses gradient
import {
  ArrowUpDown,
  ChevronLeft,
  Filter,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  X,
} from 'lucide-react-native';
import { NotionCheckbox } from '../components/project/NotionCheckbox';
import { VocabularyTypeBadge } from '../components/project/VocabularyTypeBadge';
import { Button, Input } from '../components/ui';
import { ScanModeModal } from '../components/scan/ScanModeModal';
import { ProcessingModal } from '../components/ProcessingModal';
import colors from '../constants/colors';
import { getThumbnailColor } from '../constants/theme';
import { useAuth } from '../hooks/use-auth';
import { useTabBar } from '../hooks/use-tab-bar';
import { getRepository } from '../lib/db';
import { buildDistractors, MINIMUM_QUIZ_WORDS } from '../lib/quiz-helpers';
import { createScanJob, waitForScanJobCompletion, type ScanMode } from '../lib/scan-jobs';
import { withWebAppBase } from '../lib/web-base-url';
import type { ProgressStep, Project, RootStackParamList, VocabularyType, Word } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProjectRoute = RouteProp<RootStackParamList, 'Project'>;
type SupportedScanMode = Extract<ScanMode, 'all' | 'circled' | 'eiken'>;

// ─── POS abbreviation map ────────────────────────────────────
const POS_SHORT: Record<string, string> = {
  '名詞': '名', '動詞': '動', '形容詞': '形', '副詞': '副',
  '前置詞': '前', '接続詞': '接', '代名詞': '代', '熟語': '熟',
  '句動詞': '句', noun: '名', verb: '動', adjective: '形',
  adverb: '副', preposition: '前', conjunction: '接', pronoun: '代',
  phrase: '熟', phrasal_verb: '句',
};

function shortenPos(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return '—';
  return tags
    .slice(0, 2)
    .map((t) => POS_SHORT[t.toLowerCase()] ?? POS_SHORT[t] ?? t.charAt(0))
    .join('・');
}

type SortMode = 'date' | 'alpha';
type StatusFilter = 'all' | 'mastered' | 'review' | 'new';

function generateShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

// ═══════════════════════════════════════════════════════════════
export function ProjectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProjectRoute>();
  const insets = useSafeAreaInsets();
  const { hide: hideTabBar, show: showTabBar } = useTabBar();
  const { session, subscription, isAuthenticated, isPro, loading: authLoading } = useAuth();

  const repository = useMemo(() => getRepository(subscription?.status ?? 'free'), [subscription?.status]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoadRef = useRef(true);

  // Word modal
  const [showWordModal, setShowWordModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [wordEnglish, setWordEnglish] = useState('');
  const [wordJapanese, setWordJapanese] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [savingWord, setSavingWord] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  // Scan
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([
    { id: 'upload', label: '画像をアップロード中...', status: 'pending' as const },
    { id: 'process', label: '単語を抽出中...', status: 'pending' as const },
    { id: 'save', label: '保存先を準備中...', status: 'pending' as const },
  ]);

  // Search / Filter / Sort
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bookmarkFilter, setBookmarkFilter] = useState(false);

  // ─── Data loading ─────────────────────────────────────────
  const loadProject = useCallback(async () => {
    if (authLoading) return;
    if (isFirstLoadRef.current) setLoading(true);
    try {
      const [p, w] = await Promise.all([
        repository.getProject(route.params.projectId),
        repository.getWords(route.params.projectId),
      ]);
      if (!p) { Alert.alert('単語帳が見つかりません'); navigation.goBack(); return; }
      setProject(p); setProjectTitle(p.title); setWords(w);
    } catch {
      Alert.alert('エラー', '単語帳の読み込みに失敗しました。');
      navigation.goBack();
    } finally {
      isFirstLoadRef.current = false;
      setLoading(false);
    }
  }, [authLoading, navigation, repository, route.params.projectId]);

  useFocusEffect(useCallback(() => {
    hideTabBar();
    return () => showTabBar();
  }, [hideTabBar, showTabBar]));

  useFocusEffect(useCallback(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadProject();
    });
    return () => task.cancel();
  }, [loadProject]));

  // ─── Computed ─────────────────────────────────────────────
  const masteredCount = useMemo(() => words.filter((w) => w.status === 'mastered').length, [words]);
  const reviewCount = useMemo(() => words.filter((w) => w.status === 'review').length, [words]);
  const newCount = useMemo(() => words.length - masteredCount - reviewCount, [words, masteredCount, reviewCount]);

  const filteredWords = useMemo(() => {
    let r = words;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      r = r.filter((w) => w.english.toLowerCase().includes(q) || w.japanese.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') r = r.filter((w) => w.status === statusFilter);
    if (bookmarkFilter) r = r.filter((w) => w.isFavorite);
    if (sortMode === 'alpha') r = [...r].sort((a, b) => a.english.localeCompare(b.english));
    return r;
  }, [words, searchText, statusFilter, bookmarkFilter, sortMode]);

  const hasActiveFilters = statusFilter !== 'all' || bookmarkFilter || searchText.trim().length > 0;

  // ─── Handlers ─────────────────────────────────────────────
  const handleProtectedAction = useCallback(
    (opts?: { requirePro?: boolean; featureName?: string }) => {
      if (!isAuthenticated || !session?.access_token) {
        Alert.alert('ログインが必要です', `${opts?.featureName ?? 'この機能'}を使うにはログインしてください。`, [
          { text: '閉じる', style: 'cancel' }, { text: 'ログイン', onPress: () => (navigation as any).navigate('SettingsTab', { screen: 'Login' }) },
        ]);
        return false;
      }
      if (opts?.requirePro && !isPro) {
        Alert.alert('Pro が必要です', `${opts.featureName ?? 'この機能'}は Pro で確認できます。`, [
          { text: '閉じる', style: 'cancel' }, { text: 'Pro を見る', onPress: () => (navigation as any).navigate('SettingsTab', { screen: 'Subscription' }) },
        ]);
        return false;
      }
      return true;
    }, [isAuthenticated, isPro, navigation, session?.access_token]);

  const openCreateWordModal = () => { setEditingWord(null); setWordEnglish(''); setWordJapanese(''); setShowWordModal(true); };
  const openEditWordModal = (w: Word) => { setEditingWord(w); setWordEnglish(w.english); setWordJapanese(w.japanese); setShowWordModal(true); };

  const handleSaveProjectTitle = useCallback(async () => {
    if (!project) return;
    const t = projectTitle.trim();
    if (!t) { Alert.alert('単語帳名を入力してください'); return; }
    setSavingProject(true);
    try { await repository.updateProject(project.id, { title: t }); setProject((c) => c ? { ...c, title: t } : c); setShowRenameModal(false); }
    catch { Alert.alert('エラー', '更新に失敗しました。'); }
    finally { setSavingProject(false); }
  }, [project, projectTitle, repository]);

  const handleDeleteProject = useCallback(() => {
    if (!project) return;
    Alert.alert('単語帳を削除しますか？', 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        try { await repository.deleteProject(project.id); navigation.goBack(); }
        catch { Alert.alert('エラー', '削除に失敗しました。'); }
      }},
    ]);
  }, [navigation, project, repository]);

  const handleSaveWord = useCallback(async () => {
    if (!project) return;
    const en = wordEnglish.trim(), ja = wordJapanese.trim();
    if (!en || !ja) { Alert.alert('英単語と日本語訳を入力してください'); return; }
    setSavingWord(true);
    try {
      if (editingWord) {
        await repository.updateWord(editingWord.id, { english: en, japanese: ja, distractors: buildDistractors(words, ja, editingWord.id) });
      } else {
        await repository.createWords([{ projectId: project.id, english: en, japanese: ja, distractors: buildDistractors(words, ja) }]);
      }
      setShowWordModal(false); setEditingWord(null); setWordEnglish(''); setWordJapanese('');
      await loadProject();
    } catch { Alert.alert('エラー', '保存に失敗しました。'); }
    finally { setSavingWord(false); }
  }, [editingWord, loadProject, project, repository, wordEnglish, wordJapanese, words]);

  const handleDeleteWord = useCallback((w: Word) => {
    Alert.alert('単語を削除しますか？', `${w.english} を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        try { await repository.deleteWord(w.id); await loadProject(); }
        catch { Alert.alert('エラー', '削除に失敗しました。'); }
      }},
    ]);
  }, [loadProject, repository]);

  const handleStatusChange = useCallback((w: Word, s: Word['status']) => {
    // Optimistic UI: update state immediately, persist in background
    setWords((c) => c.map((x) => x.id === w.id ? { ...x, status: s } : x));
    InteractionManager.runAfterInteractions(() => {
      repository.updateWord(w.id, { status: s }).catch(() => {
        // Rollback on failure
        setWords((c) => c.map((x) => x.id === w.id ? { ...x, status: w.status } : x));
        Alert.alert('エラー', 'ステータス更新に失敗しました。');
      });
    });
  }, [repository]);

  const handleVocabTypeCycle = useCallback((w: Word, next: VocabularyType | undefined) => {
    // Optimistic UI: update state immediately, persist in background
    setWords((c) => c.map((x) => x.id === w.id ? { ...x, vocabularyType: next } : x));
    InteractionManager.runAfterInteractions(() => {
      repository.updateWord(w.id, { vocabularyType: next ?? (null as any) }).catch(() => {
        setWords((c) => c.map((x) => x.id === w.id ? { ...x, vocabularyType: w.vocabularyType } : x));
        Alert.alert('エラー', '語彙タイプの更新に失敗しました。');
      });
    });
  }, [repository]);

  const handleShareProject = useCallback(async () => {
    if (!project || !handleProtectedAction({ requirePro: true, featureName: '共有' })) return;
    try {
      let sid = project.shareId;
      if (!sid) { sid = generateShareId(); await repository.updateProject(project.id, { shareId: sid, shareScope: 'public' }); setProject((c) => c ? { ...c, shareId: sid, shareScope: 'public' } : c); }
      const url = `${withWebAppBase('/share')}/${sid}`;
      await Share.share({ message: `「${project.title}」の単語帳を共有します\n${url}`, title: project.title, url });
    } catch (e) { Alert.alert('共有に失敗しました', e instanceof Error ? e.message : '共有リンクを生成できませんでした。'); }
  }, [handleProtectedAction, project, repository]);

  const handleMoreMenu = useCallback(() => {
    if (!project) return;
    Alert.alert(project.title, undefined, [
      { text: '名前を変更', onPress: () => setShowRenameModal(true) },
      { text: 'スキャン追加', onPress: () => { if (handleProtectedAction({ featureName: 'スキャン' })) setShowScanModeModal(true); } },
      { text: '単語帳を削除', style: 'destructive', onPress: handleDeleteProject },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, [handleDeleteProject, handleProtectedAction, project]);

  const handleSortMenu = useCallback(() => {
    Alert.alert('並び替え', undefined, [
      { text: '追加順', onPress: () => setSortMode('date') },
      { text: 'アルファベット', onPress: () => setSortMode('alpha') },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, []);

  const handleFilterMenu = useCallback(() => {
    Alert.alert('フィルター', undefined, [
      { text: bookmarkFilter ? '☆ ブックマーク解除' : '★ ブックマークのみ', onPress: () => setBookmarkFilter((v) => !v) },
      { text: 'すべて', onPress: () => setStatusFilter('all') },
      { text: '習得のみ', onPress: () => setStatusFilter('mastered') },
      { text: '学習中のみ', onPress: () => setStatusFilter('review') },
      { text: '未学習のみ', onPress: () => setStatusFilter('new') },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, [bookmarkFilter]);

  // ─── Scan ─────────────────────────────────────────────────
  const promptImageSource = useCallback((mode: SupportedScanMode, lvl?: string | null) => {
    Alert.alert('画像を選択', 'カメラかライブラリを選んでください。', [
      { text: 'カメラ', onPress: () => { void doScan(mode, 'camera', lvl ?? null); } },
      { text: 'ライブラリ', onPress: () => { void doScan(mode, 'library', lvl ?? null); } },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, []);

  const doScan = useCallback(async (mode: SupportedScanMode, src: 'camera' | 'library', lvl?: string | null) => {
    if (!project || !session?.access_token) { Alert.alert('ログインが必要です'); return; }
    try {
      const perm = src === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('権限が必要です'); return; }
      const res = src === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
      if (res.canceled || !res.assets[0]?.uri) return;
      setProcessing(true);
      setProcessingSteps([{ id: 'upload', label: '画像をアップロード中...', status: 'active' }, { id: 'process', label: '単語を抽出中...', status: 'pending' }, { id: 'save', label: '単語帳に追加中...', status: 'pending' }]);
      const created = await createScanJob({ session, imageUri: res.assets[0].uri, projectTitle: project.title, scanMode: mode, eikenLevel: lvl ?? null, targetProjectId: project.id, mimeType: res.assets[0].mimeType });
      setProcessingSteps([{ id: 'upload', label: '画像をアップロード中...', status: 'complete' }, { id: 'process', label: '単語を抽出中...', status: 'active' }, { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : '単語帳に追加中...', status: 'pending' }]);
      const done = await waitForScanJobCompletion(session, created.jobId);
      const pr = done.parsedResult ?? {};
      setProcessingSteps([{ id: 'upload', label: '画像をアップロード中...', status: 'complete' }, { id: 'process', label: '単語を抽出中...', status: 'complete' }, { id: 'save', label: created.saveMode === 'client_local' ? '確認画面を準備中...' : '単語帳に追加中...', status: 'active' }]);
      if (created.saveMode === 'client_local') { setProcessing(false); navigation.navigate('ScanConfirm', { words: (pr.extractedWords ?? []) as any, projectName: project.title, projectId: project.id }); return; }
      setProcessing(false); await loadProject();
      Alert.alert('スキャン完了', `${typeof pr.wordCount === 'number' ? pr.wordCount : '複数'}語を追加しました。`);
    } catch (e) {
      setProcessingSteps((c) => { let h = false; return c.map((s) => { if (!h && (s.status === 'active' || s.status === 'pending')) { h = true; return { ...s, status: 'error', label: e instanceof Error ? e.message : 'スキャンに失敗しました。' }; } return s; }); });
    }
  }, [loadProject, navigation, project, session]);

  // ─── Loading ──────────────────────────────────────────────
  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={'#1a1a1a'} /><Text style={s.loadText}>単語帳を読み込み中...</Text></View>;
  if (!project) return null;
  const quizReady = words.length >= MINIMUM_QUIZ_WORDS;

  // ─── Render ───────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* ── Header (colored like thumbnail) ──────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: getThumbnailColor(project.id) }]}>
        <View style={s.hRow}>
          <TouchableOpacity style={s.hBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <View style={s.hCenter}>
            <Text style={s.hTitle} numberOfLines={1}>{project.title}</Text>
            <Text style={s.hSub}>{words.length}語</Text>
          </View>
          <View style={s.hRight}>
            {isPro && (
              <TouchableOpacity style={s.hBtn} onPress={() => void handleShareProject()}>
                <Share2 size={18} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.hBtn} onPress={handleMoreMenu}>
              <MoreHorizontal size={18} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Scroll ────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scroll}>
        <FlatList
          data={filteredWords}
          keyExtractor={wordKeyExtractor}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          getItemLayout={wordItemLayout}
          contentContainerStyle={s.scrollInner}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Progress card */}
              <View style={s.statsCard}>
                <ProgressCol count={masteredCount} total={words.length} label="習得" iconColor={colors.emerald[500]} icon="✓" />
                <ProgressCol count={reviewCount} total={words.length} label="学習中" iconColor={colors.gray[500]} icon="↻" />
                <ProgressCol count={newCount} total={words.length} label="未学習" iconColor={colors.gray[300]} icon="✦" />
              </View>

              {/* Word list header */}
              <View style={s.wlHeader}>
                <View style={s.wlTitleRow}><Text style={s.wlTitle}>単語一覧</Text><Text style={s.wlCount}>{words.length}</Text></View>
                <View style={s.tb}>
                  <TouchableOpacity style={[s.tbBtn, searchActive && s.tbBtnAct]} onPress={() => { setSearchActive((v) => !v); if (searchActive) setSearchText(''); }}>
                    {searchActive ? <X size={16} color={'#1a1a1a'} /> : <Search size={16} color={colors.gray[500]} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.tbBtn, (statusFilter !== 'all' || bookmarkFilter) && s.tbBtnAct]} onPress={handleFilterMenu}>
                    <Filter size={16} color={(statusFilter !== 'all' || bookmarkFilter) ? '#1a1a1a' : colors.gray[500]} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.tbBtn} onPress={handleSortMenu}><ArrowUpDown size={16} color={colors.gray[500]} /></TouchableOpacity>
                  {hasActiveFilters && <Text style={s.fBadge}>{filteredWords.length}/{words.length}語</Text>}
                </View>
              </View>

              {searchActive && (
                <View style={s.searchBar}>
                  <Search size={14} color={colors.gray[400]} />
                  <TextInput style={s.searchInput} placeholder="単語を検索..." placeholderTextColor={colors.gray[400]} value={searchText} onChangeText={setSearchText} autoFocus autoCapitalize="none" autoCorrect={false} />
                  {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><X size={14} color={colors.gray[400]} /></TouchableOpacity>}
                </View>
              )}

              {/* Column header */}
              <View style={s.table}>
                <View style={s.colHead}>
                  <View style={{ width: CW.cb }} />
                  <Text style={[s.chText, { width: CW.en, textAlign: 'left', paddingLeft: 8 }]}>単語</Text>
                  <Text style={[s.chText, { width: CW.ap }]}>A/P</Text>
                  <Text style={[s.chText, { width: CW.pos }]}>品詞</Text>
                  <Text style={[s.chText, { width: CW.jp, textAlign: 'left', paddingLeft: 10 }]}>訳</Text>
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.emptyRow}><Text style={s.emptyText}>{hasActiveFilters ? '一致する単語がありません' : '単語がありません'}</Text></View>
          }
          renderItem={({ item: w, index: i }) => (
            <WordRow
              word={w}
              isLast={i === filteredWords.length - 1}
              onPress={() => (navigation as any).navigate('WordDetail', { word: w })}
              onLongPress={() => handleDeleteWord(w)}
              onStatusChange={handleStatusChange}
              onVocabTypeCycle={handleVocabTypeCycle}
            />
          )}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      </ScrollView>

      {/* ── Bottom Bar ────────────────────────────────────── */}
      <View style={[s.bot, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={s.botFlash} onPress={() => { if (handleProtectedAction({ requirePro: true, featureName: 'フラッシュカード' })) navigation.navigate('Flashcard', { projectId: project.id }); }}>
          <Layers size={20} color={'#1a1a1a'} />
        </TouchableOpacity>
        <TouchableOpacity style={s.botQuiz} onPress={() => { if (!quizReady) { Alert.alert(`最低${MINIMUM_QUIZ_WORDS}語必要です。`); return; } navigation.navigate('Quiz', { projectId: project.id }); }}>
          <Text style={s.botQuizText}>クイズ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.botAdd} onPress={() => {
          Alert.alert('単語を追加', undefined, [
            { text: '手動で追加', onPress: openCreateWordModal },
            { text: 'スキャンで追加', onPress: () => { if (handleProtectedAction({ featureName: 'スキャン' })) setShowScanModeModal(true); } },
            { text: 'キャンセル', style: 'cancel' },
          ]);
        }}>
          <Plus size={15} color="#fff" strokeWidth={2.5} /><Text style={s.botAddText}>単語追加</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modals ────────────────────────────────────────── */}
      <Modal visible={showWordModal} transparent animationType="fade" onRequestClose={() => setShowWordModal(false)}>
        <View style={s.mOver}><View style={s.mCard}>
          <Text style={s.mTitle}>{editingWord ? '単語を編集' : '単語を追加'}</Text>
          <Input label="英単語" value={wordEnglish} onChangeText={setWordEnglish} placeholder="example" autoCapitalize="none" autoFocus />
          <Input label="日本語訳" value={wordJapanese} onChangeText={setWordJapanese} placeholder="例" />
          <View style={s.mBtns}><Button variant="secondary" onPress={() => setShowWordModal(false)}>キャンセル</Button><Button onPress={handleSaveWord} loading={savingWord}>保存</Button></View>
        </View></View>
      </Modal>
      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <View style={s.mOver}><View style={s.mCard}>
          <Text style={s.mTitle}>単語帳名を変更</Text>
          <Input label="単語帳名" value={projectTitle} onChangeText={setProjectTitle} placeholder="単語帳名" autoFocus />
          <View style={s.mBtns}><Button variant="secondary" onPress={() => setShowRenameModal(false)}>キャンセル</Button><Button onPress={handleSaveProjectTitle} loading={savingProject}>更新</Button></View>
        </View></View>
      </Modal>
      <ProcessingModal visible={processing} steps={processingSteps} onClose={() => { setProcessing(false); setProcessingSteps([{ id: 'upload', label: '画像をアップロード中...', status: 'pending' }, { id: 'process', label: '単語を抽出中...', status: 'pending' }, { id: 'save', label: '保存先を準備中...', status: 'pending' }]); }} />
      <ScanModeModal visible={showScanModeModal} isPro={isPro} title="追加スキャン" subtitle="この単語帳に追加するモードを選んでください。" onClose={() => setShowScanModeModal(false)} onRequirePro={() => { void handleProtectedAction({ requirePro: true, featureName: 'このスキャンモード' }); }} onSelectMode={(m, l) => { promptImageSource(m, l ?? null); }} />
    </View>
  );
}

// ─── FlatList helpers ────────────────────────────────────────
const WORD_ROW_HEIGHT = 48;
const wordKeyExtractor = (item: Word) => item.id;
const wordItemLayout = (_data: unknown, index: number) => ({
  length: WORD_ROW_HEIGHT,
  offset: WORD_ROW_HEIGHT * index,
  index,
});

// ─── WordRow (memoized for FlatList performance) ─────────────
const WordRow = React.memo(function WordRow({
  word: w,
  isLast,
  onPress,
  onLongPress,
  onStatusChange,
  onVocabTypeCycle,
}: {
  word: Word;
  isLast: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onStatusChange: (w: Word, s: Word['status']) => void;
  onVocabTypeCycle: (w: Word, next: VocabularyType | undefined) => void;
}) {
  const handleStatus = useCallback((ns: Word['status']) => onStatusChange(w, ns), [onStatusChange, w]);
  const handleVocab = useCallback((n: VocabularyType | undefined) => onVocabTypeCycle(w, n), [onVocabTypeCycle, w]);

  return (
    <TouchableOpacity style={[s.row, !isLast && s.rowBorder]} activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress}>
      <View style={{ width: CW.cb }}><NotionCheckbox wordId={w.id} status={w.status} onStatusChange={handleStatus} /></View>
      <View style={[s.cellEn, { width: CW.en }]}><Text style={s.enText} numberOfLines={2}>{w.english}</Text>{w.isFavorite && <Text style={s.bm}>★</Text>}</View>
      <View style={{ width: CW.ap, alignItems: 'center' }}><VocabularyTypeBadge value={w.vocabularyType} onCycle={handleVocab} /></View>
      <Text style={[s.posText, { width: CW.pos }]}>{shortenPos(w.partOfSpeechTags)}</Text>
      <Text style={[s.jpText, { width: CW.jp }]} numberOfLines={2}>{w.japanese}</Text>
    </TouchableOpacity>
  );
});

// ─── Progress Column ─────────────────────────────────────────
function ProgressCol({ count, total, label, iconColor, icon }: { count: number; total: number; label: string; iconColor: string; icon: string }) {
  return (
    <View style={s.pCol}>
      <Text style={s.pCount}>{count}/{total}語</Text>
      <Text style={s.pLabel}>{label}</Text>
      <View style={[s.pIcon, { borderColor: iconColor }]}><Text style={[s.pIconTxt, { color: iconColor }]}>{icon}</Text></View>
    </View>
  );
}

// ─── Column widths ───────────────────────────────────────────
const CW = { cb: 34, en: 158, ap: 48, pos: 48, jp: 180 };

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  loadText: { color: colors.gray[500], fontSize: 14 },

  header: { paddingBottom: 16, paddingHorizontal: 16 },
  hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  hTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  hSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  hRight: { flexDirection: 'row', gap: 8 },

  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingTop: 16 },

  statsCard: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.gray[200], padding: 16, gap: 12, marginBottom: 16 },
  pCol: { flex: 1, alignItems: 'center', gap: 6 },
  pCount: { fontSize: 12, color: colors.gray[500], fontVariant: ['tabular-nums'] },
  pLabel: { fontSize: 14, fontWeight: '700', color: colors.gray[900] },
  pIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pIconTxt: { fontSize: 16, fontWeight: '700' },

  wlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  wlTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  wlTitle: { fontSize: 20, fontWeight: '800', color: colors.gray[900] },
  wlCount: { fontSize: 13, fontWeight: '600', color: colors.gray[500], fontVariant: ['tabular-nums'] },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tbBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  tbBtnAct: { backgroundColor: 'rgba(26,26,26,0.06)', borderColor: 'rgba(26,26,26,0.2)' },
  fBadge: { fontSize: 11, fontWeight: '500', color: '#1a1a1a', fontVariant: ['tabular-nums'] },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gray[100], borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.gray[900], padding: 0 },

  table: { minWidth: CW.cb + CW.en + CW.ap + CW.pos + CW.jp + 16 },
  colHead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.gray[200], paddingVertical: 6 },
  chText: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  cellEn: { paddingLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  enText: { fontSize: 18, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  bm: { fontSize: 11, color: colors.amber[500], fontWeight: '700' },
  posText: { fontSize: 15, fontWeight: '600', color: colors.gray[600], textAlign: 'center' },
  jpText: { fontSize: 13, color: colors.gray[600], paddingLeft: 10 },
  emptyRow: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.gray[500] },

  bot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.background,    },
  botFlash: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  botQuiz: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.gray[200] },
  botQuizIcon: { fontSize: 15 },
  botQuizText: { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  botAdd: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: '#1a1a1a' },
  botAddText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  mOver: { flex: 1, backgroundColor: 'rgba(17,24,39,0.3)', justifyContent: 'center', padding: 20 },
  mCard: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 16 },
  mTitle: { fontSize: 20, fontWeight: '800', color: colors.gray[900] },
  mBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
