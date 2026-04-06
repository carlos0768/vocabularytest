import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  Download,
  Filter,
  List,
  Search,
  X,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import { useAuth } from '../hooks/use-auth';
import { getRepository } from '../lib/db';
import { fetchSharedProjectDetail, type SharedProjectDetail, type SharedWord } from '../lib/shared-projects';
import { getGuestUserId } from '../lib/utils';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SharedProjectDetailRouteProp = RouteProp<RootStackParamList, 'SharedProjectDetail'>;

type SortMode = 'date' | 'alpha';
type APFilter = 'all' | 'active' | 'passive';

const POS_SHORT: Record<string, string> = {
  noun: '名', verb: '動', adjective: '形', adverb: '副',
  preposition: '前', conjunction: '接', pronoun: '代',
  phrase: '熟', phrasal_verb: '句', idiom: '熟',
};

function shortenPos(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return '—';
  return tags.slice(0, 2).map((t) => POS_SHORT[t.toLowerCase()] ?? t.charAt(0)).join('・');
}

export function SharedProjectDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SharedProjectDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const { projectId } = route.params;
  const { session, user, isAuthenticated, subscription } = useAuth();

  const repository = useMemo(
    () => getRepository(subscription?.status ?? 'free'),
    [subscription?.status],
  );

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SharedProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Search / Filter / Sort
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [apFilter, setApFilter] = useState<APFilter>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Import sheet
  const [showImportSheet, setShowImportSheet] = useState(false);

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
      }
    },
    [projectId, session?.access_token],
  );

  useFocusEffect(useCallback(() => { void loadDetail(); }, [loadDetail]));

  const words = detail?.words ?? [];

  const filteredWords = useMemo(() => {
    let r: SharedWord[] = words;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      r = r.filter((w) => w.english.toLowerCase().includes(q) || w.japanese.toLowerCase().includes(q));
    }
    if (apFilter === 'active') r = r.filter((w) => w.vocabularyType === 'active');
    else if (apFilter === 'passive') r = r.filter((w) => w.vocabularyType === 'passive');
    if (sortMode === 'alpha') r = [...r].sort((a, b) => a.english.localeCompare(b.english));
    return r;
  }, [words, searchText, apFilter, sortMode]);

  const hasActiveFilters = searchText.trim().length > 0 || apFilter !== 'all';

  const doImport = useCallback(async (targetWords: SharedWord[]) => {
    if (!detail || targetWords.length === 0) return;
    setImporting(true);
    setShowImportSheet(false);
    try {
      const userId = isAuthenticated && user?.id ? user.id : await getGuestUserId();
      const createdProject = await repository.createProject({
        userId,
        title: detail.project.title,
        importedFromShareId: projectId,
      });
      await repository.createWords(
        targetWords.map((w) => ({
          projectId: createdProject.id,
          english: w.english,
          japanese: w.japanese,
          distractors: [],
          pronunciation: w.pronunciation,
          exampleSentence: w.exampleSentence,
          exampleSentenceJa: w.exampleSentenceJa,
          vocabularyType: w.vocabularyType,
        })),
      );
      setSelectMode(false);
      setSelectedIds(new Set());
      Alert.alert('完了', `${targetWords.length}語を追加しました。`, [
        { text: '開く', onPress: () => navigation.navigate('Project', { projectId: createdProject.id }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('エラー', e instanceof Error ? e.message : '取り込みに失敗しました。');
    } finally {
      setImporting(false);
    }
  }, [detail, isAuthenticated, navigation, projectId, repository, user?.id]);

  const handleSortMenu = useCallback(() => {
    Alert.alert('並び替え', undefined, [
      { text: '追加順', onPress: () => setSortMode('date') },
      { text: 'アルファベット', onPress: () => setSortMode('alpha') },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, []);

  const handleFilterMenu = useCallback(() => {
    setShowFilterSheet(true);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleImportButton = useCallback(() => {
    if (selectMode) {
      const selected = words.filter((w) => selectedIds.has(w.id));
      void doImport(selected);
    } else {
      setShowImportSheet(true);
    }
  }, [selectMode, words, selectedIds, doImport]);

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadWrap}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={s.loadText}>共有単語帳を読み込み中...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.loadWrap}>
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
          <Button size="sm" onPress={() => void loadDetail()}>再読み込み</Button>
        </View>
      </View>
    );
  }

  if (!detail) return null;

  // ─── Render ───────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* ── Blue Header ──── */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.primary[600] }]}>
        <View style={s.hRow}>
          <TouchableOpacity style={s.hBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={s.hCenter}>
            <Text style={s.hTitle} numberOfLines={1}>{detail.project.title}</Text>
            <Text style={s.hSub}>{words.length}語</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* ── Scroll ────── */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner} showsVerticalScrollIndicator={false}>
        {/* Word list header */}
        <View style={s.wlHeader}>
          <View style={s.wlTitleRow}>
            <Text style={s.wlTitle}>単語一覧</Text>
            <Text style={s.wlCount}>{words.length}</Text>
          </View>
          <View style={s.tb}>
            <TouchableOpacity
              style={[s.tbBtn, searchActive && s.tbBtnAct]}
              onPress={() => { setSearchActive((v) => !v); if (searchActive) setSearchText(''); }}
            >
              {searchActive ? <X size={16} color={colors.primary[600]} /> : <Search size={16} color={colors.gray[500]} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tbBtn, apFilter !== 'all' && s.tbBtnAct]}
              onPress={handleFilterMenu}
            >
              <Filter size={16} color={apFilter !== 'all' ? colors.primary[600] : colors.gray[500]} />
            </TouchableOpacity>
            <TouchableOpacity style={s.tbBtn} onPress={handleSortMenu}>
              <ArrowUpDown size={16} color={colors.gray[500]} />
            </TouchableOpacity>
            {hasActiveFilters && <Text style={s.fBadge}>{filteredWords.length}/{words.length}語</Text>}
          </View>
        </View>

        {searchActive && (
          <View style={s.searchBar}>
            <Search size={14} color={colors.gray[400]} />
            <TextInput
              style={s.searchInput}
              placeholder="単語を検索..."
              placeholderTextColor={colors.gray[400]}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <X size={14} color={colors.gray[400]} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Table */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.table}>
            <View style={s.colHead}>
              {selectMode && <View style={{ width: CW.cb }} />}
              <Text style={[s.chText, { width: CW.en, textAlign: 'left', paddingLeft: 8 }]}>単語</Text>
              <Text style={[s.chText, { width: CW.ap }]}>A/P</Text>
              <Text style={[s.chText, { width: CW.pos }]}>品詞</Text>
              <Text style={[s.chText, { width: CW.jp, textAlign: 'left', paddingLeft: 10 }]}>訳</Text>
            </View>
            {filteredWords.length === 0 ? (
              <View style={s.emptyRow}>
                <Text style={s.emptyText}>{hasActiveFilters ? '一致する単語がありません' : '単語がありません'}</Text>
              </View>
            ) : filteredWords.map((w, i) => (
              <TouchableOpacity
                key={w.id ?? i}
                style={[s.row, i < filteredWords.length - 1 && s.rowBorder]}
                activeOpacity={selectMode ? 0.6 : 1}
                onPress={selectMode ? () => toggleSelect(w.id) : undefined}
                disabled={!selectMode}
              >
                {selectMode && (
                  <View style={{ width: CW.cb, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={[s.checkbox, selectedIds.has(w.id) && s.checkboxActive]}>
                      {selectedIds.has(w.id) && <Check size={12} color="#fff" strokeWidth={3} />}
                    </View>
                  </View>
                )}
                <View style={[s.cellEn, { width: CW.en }]}>
                  <Text style={s.enText} numberOfLines={2}>{w.english}</Text>
                </View>
                <View style={{ width: CW.ap, alignItems: 'center' }}>
                  <View style={[
                    s.apBadge,
                    w.vocabularyType === 'active' ? s.apActive
                      : w.vocabularyType === 'passive' ? s.apPassive
                        : s.apNone,
                  ]}>
                    <Text style={[
                      s.apText,
                      w.vocabularyType === 'active' || w.vocabularyType === 'passive' ? { color: '#fff' } : { color: colors.gray[400] },
                    ]}>
                      {w.vocabularyType === 'active' ? 'A' : w.vocabularyType === 'passive' ? 'P' : '—'}
                    </Text>
                  </View>
                </View>
                <Text style={[s.posText, { width: CW.pos }]}>{shortenPos(w.partOfSpeechTags)}</Text>
                <Text style={[s.jpText, { width: CW.jp }]} numberOfLines={2}>{w.japanese}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Bar ────── */}
      <View style={[s.bot, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {selectMode ? (
          <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
            <TouchableOpacity
              style={s.botCancel}
              onPress={() => { setSelectMode(false); setSelectedIds(new Set()); }}
            >
              <Text style={s.botCancelText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.botImport, selectedIds.size === 0 && { opacity: 0.5 }]}
              onPress={handleImportButton}
              disabled={importing || selectedIds.size === 0}
            >
              {importing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Download size={18} color="#fff" strokeWidth={2.5} />
              )}
              <Text style={s.botImportText}>選択した {selectedIds.size}語を追加</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.botImport} onPress={handleImportButton} disabled={importing}>
            {importing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Download size={18} color="#fff" strokeWidth={2.5} />
            )}
            <Text style={s.botImportText}>単語帳として追加</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Import Sheet Modal ────── */}
      <Modal visible={showImportSheet} transparent animationType="slide" onRequestClose={() => setShowImportSheet(false)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowImportSheet(false)}>
          <View style={s.sheetContent} onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <TouchableOpacity style={s.sheetRow} onPress={() => { setShowImportSheet(false); void doImport(words); }}>
              <Download size={20} color={colors.gray[900]} />
              <View style={s.sheetRowText}>
                <Text style={s.sheetRowTitle}>すべて追加</Text>
                <Text style={s.sheetRowSub}>{words.length}語</Text>
              </View>
            </TouchableOpacity>
            {hasActiveFilters && filteredWords.length !== words.length && (
              <TouchableOpacity style={s.sheetRow} onPress={() => { setShowImportSheet(false); void doImport(filteredWords); }}>
                <Filter size={20} color={colors.primary[600]} />
                <View style={s.sheetRowText}>
                  <Text style={s.sheetRowTitle}>フィルタ結果を追加</Text>
                  <Text style={s.sheetRowSub}>{filteredWords.length}語</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.sheetRow} onPress={() => { setShowImportSheet(false); setSelectMode(true); setSelectedIds(new Set()); }}>
              <List size={20} color={colors.gray[500]} />
              <View style={s.sheetRowText}>
                <Text style={s.sheetRowTitle}>選択して追加</Text>
                <Text style={s.sheetRowSub}>追加する単語を選んでください</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Filter Sheet Modal ────── */}
      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)}>
          <View style={s.sheetContent} onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <Text style={s.filterTitle}>アクティブ / パッシブ</Text>
            <View style={s.filterRow}>
              {([['all', 'すべて'], ['active', 'アクティブ'], ['passive', 'パッシブ']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[s.filterChip, apFilter === val && s.filterChipActive]}
                  onPress={() => { setApFilter(val); setShowFilterSheet(false); }}
                >
                  <Text style={[s.filterChipText, apFilter === val && s.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  errorCard: { backgroundColor: colors.red[50], borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.red[200], gap: 12, alignItems: 'center', marginHorizontal: 20 },
  errorText: { fontSize: 14, color: colors.red[700], textAlign: 'center' },

  header: { paddingBottom: 20, paddingHorizontal: 16 },
  hRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  hTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  hSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingTop: 16 },

  wlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  wlTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  wlTitle: { fontSize: 20, fontWeight: '800', color: colors.gray[900] },
  wlCount: { fontSize: 13, fontWeight: '600', color: colors.gray[500], fontVariant: ['tabular-nums'] },
  tb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tbBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  tbBtnAct: { backgroundColor: colors.primary[50], borderColor: colors.primary[300] },
  fBadge: { fontSize: 11, fontWeight: '500', color: colors.primary[600], fontVariant: ['tabular-nums'] },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gray[100], borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.gray[900], padding: 0 },

  table: { minWidth: CW.en + CW.ap + CW.pos + CW.jp + 16 },
  colHead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.gray[200], paddingVertical: 6 },
  chText: { fontSize: 12, fontWeight: '700', color: colors.gray[500], textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  cellEn: { paddingLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  enText: { fontSize: 18, fontWeight: '700', color: colors.gray[900], flexShrink: 1 },
  posText: { fontSize: 15, fontWeight: '600', color: colors.gray[600], textAlign: 'center' },
  jpText: { fontSize: 13, color: colors.gray[600], paddingLeft: 10 },
  emptyRow: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, color: colors.gray[500] },

  apBadge: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  apActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  apPassive: { backgroundColor: colors.gray[500], borderColor: colors.gray[500] },
  apNone: { backgroundColor: 'transparent', borderColor: colors.gray[300] },
  apText: { fontSize: 11, fontWeight: '900' },

  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },

  bot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  botImport: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary[600] },
  botImportText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  botCancel: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200] },
  botCancelText: { fontSize: 15, fontWeight: '600', color: colors.gray[500] },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray[300], alignSelf: 'center', marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  sheetRowText: { flex: 1, gap: 2 },
  sheetRowTitle: { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  sheetRowSub: { fontSize: 12, color: colors.gray[500] },

  filterTitle: { fontSize: 13, fontWeight: '700', color: colors.gray[500], marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white },
  filterChipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.gray[600] },
  filterChipTextActive: { color: '#fff' },
});
