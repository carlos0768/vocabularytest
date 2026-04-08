import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Flag,
  Volume2,
  Trash2,
  Pencil,
  Search,
  Languages,
} from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { getRepository } from '../lib/db';
import { useAuth } from '../hooks/use-auth';
import { useTabBar } from '../hooks/use-tab-bar';
import { shuffleArray, saveFlashcardProgress, loadFlashcardProgress } from '../lib/utils';
import theme from '../constants/theme';
import type { RootStackParamList, Word } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'Flashcard'>;

const MASTERY_DOTS = [0, 1, 2, 3];

function getMasteryLevel(word: Word): number {
  if (word.status === 'mastered') return 4;
  if (word.status === 'review') return 2;
  return 0;
}

export function FlashcardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { hide: hideTabBar, show: showTabBar } = useTabBar();
  const projectId = route.params.projectId;
  const favoritesOnly = route.params.favoritesOnly ?? false;
  const { subscription, isPro, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flipAnim] = useState(new Animated.Value(0));
  const [isAnimating, setIsAnimating] = useState(false);

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(currentIndex);
  const wordsLengthRef = useRef(words.length);
  const isAnimatingRef = useRef(isAnimating);

  useEffect(() => { hideTabBar(); return () => showTabBar(); }, [hideTabBar, showTabBar]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { wordsLengthRef.current = words.length; }, [words]);
  useEffect(() => { isAnimatingRef.current = isAnimating; }, [isAnimating]);

  const repository = getRepository(subscription?.status || 'free');

  const saveProgress = useCallback(async (wordList: Word[], index: number) => {
    if (wordList.length > 0) {
      await saveFlashcardProgress(projectId, favoritesOnly, wordList.map(w => w.id), index);
    }
  }, [projectId, favoritesOnly]);

  useEffect(() => {
    if (words.length > 0 && !loading) saveProgress(words, currentIndex);
  }, [currentIndex, words, saveProgress, loading]);

  useEffect(() => {
    if (authLoading) return;
    if (!isPro && !favoritesOnly) {
      (navigation as any).navigate('SettingsTab', { screen: 'Subscription' });
      return;
    }
    const loadWords = async () => {
      try {
        const allWords = await repository.getWords(projectId);
        const wordsData = favoritesOnly ? allWords.filter((w) => w.isFavorite) : allWords;
        if (wordsData.length === 0) { navigation.canGoBack() ? navigation.goBack() : (navigation.getParent() as any)?.navigate('HomeTab'); return; }
        const savedProgress = await loadFlashcardProgress(projectId, favoritesOnly);
        if (savedProgress) {
          const wordMap = new Map(wordsData.map(w => [w.id, w]));
          const orderedWords = savedProgress.wordIds.map(id => wordMap.get(id)).filter((w): w is Word => w !== undefined);
          if (orderedWords.length >= wordsData.length * 0.8) { setWords(orderedWords); setCurrentIndex(savedProgress.currentIndex); setLoading(false); return; }
        }
        setWords(shuffleArray(wordsData));
      } catch { navigation.canGoBack() ? navigation.goBack() : (navigation.getParent() as any)?.navigate('HomeTab'); }
      finally { setLoading(false); }
    };
    loadWords();
  }, [projectId, repository, navigation, authLoading, favoritesOnly, isPro]);

  const currentWord = words[currentIndex];

  // ── Flip with simple opacity crossfade (no 3D rotation issues) ──
  const handleFlip = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    const toValue = isFlipped ? 0 : 1;
    Animated.timing(flipAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIsFlipped(!isFlipped);
      setIsAnimating(false);
    });
  }, [isFlipped, isAnimating, flipAnim]);

  const goToCard = useCallback((nextIndex: number) => {
    if (isAnimating) return;
    setCurrentIndex(nextIndex);
    setIsFlipped(false);
    flipAnim.setValue(0);
    swipeAnim.setValue(0);
  }, [isAnimating, flipAnim, swipeAnim]);

  const handleNext = useCallback(() => { if (currentIndex < words.length - 1) goToCard(currentIndex + 1); }, [currentIndex, words.length, goToCard]);
  const handlePrev = useCallback(() => { if (currentIndex > 0) goToCard(currentIndex - 1); }, [currentIndex, goToCard]);

  const handleNextRef = useRef(handleNext);
  const handlePrevRef = useRef(handlePrev);
  useEffect(() => { handleNextRef.current = handleNext; handlePrevRef.current = handlePrev; });

  // Swipe: right = prev, left = next (iOS-style)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) handleNextRef.current();
        else if (g.dx > SWIPE_THRESHOLD) handlePrevRef.current();
      },
    })
  ).current;

  const handleShuffle = useCallback(() => {
    if (isAnimating) return;
    const shuffled = shuffleArray([...words]);
    setWords(shuffled); setCurrentIndex(0); setIsFlipped(false); flipAnim.setValue(0); swipeAnim.setValue(0);
    saveProgress(shuffled, 0);
  }, [isAnimating, words, flipAnim, swipeAnim, saveProgress]);

  const handleSpeak = useCallback(() => {
    if (currentWord?.english) Speech.speak(currentWord.english, { language: 'en-US', rate: 0.85 });
  }, [currentWord]);

  const handleToggleFavorite = useCallback(async () => {
    if (!currentWord) return;
    const next = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: next });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, isFavorite: next } : w));
  }, [currentWord, currentIndex, repository]);

  const handleDeleteWord = useCallback(() => {
    if (!currentWord) return;
    Alert.alert('単語を削除', `「${currentWord.english}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        await repository.deleteWord(currentWord.id);
        const newWords = words.filter((_, i) => i !== currentIndex);
        if (newWords.length === 0) { navigation.canGoBack() ? navigation.goBack() : (navigation.getParent() as any)?.navigate('HomeTab'); return; }
        setWords(newWords); setCurrentIndex(Math.min(currentIndex, newWords.length - 1)); setIsFlipped(false); flipAnim.setValue(0);
      }},
    ]);
  }, [currentWord, currentIndex, words, repository, navigation, flipAnim]);

  const handleClose = useCallback(() => {
    navigation.canGoBack() ? navigation.goBack() : (navigation.getParent() as any)?.navigate('HomeTab');
  }, [navigation]);

  // Flip interpolation: crossfade
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  if (loading) {
    // SQLite reads are fast (<100ms) — show a blank frame instead of a spinner
    // to avoid a visible loading flash during navigation transition
    return <View style={s.loadingWrap} />;
  }

  if (!currentWord) return null;

  const mastery = getMasteryLevel(currentWord);
  const progress = words.length > 0 ? (currentIndex + 1) / words.length : 0;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header: X + progress counter */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
          <X size={22} color={theme.secondaryText} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={s.progressPill}>
          <Text style={s.progressText}>{currentIndex + 1} / {words.length}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Card */}
      <View style={s.cardArea}>
        <Animated.View {...panResponder.panHandlers} style={s.cardWrap}>
          <TouchableOpacity activeOpacity={0.97} onPress={handleFlip} style={s.cardTouchable}>
            {/* Front */}
            <Animated.View style={[s.card, s.cardFront, { opacity: frontOpacity }]}>
              {/* Mode badge + speaker */}
              <View style={s.cardTopRow}>
                <View style={s.modeBadge}><Text style={s.modeBadgeText}>英→日</Text></View>
                <TouchableOpacity onPress={handleSpeak} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Volume2 size={22} color={theme.primaryText} />
                </TouchableOpacity>
              </View>

              {/* Mastery dots */}
              <View style={s.masteryRow}>
                {MASTERY_DOTS.map(i => (
                  <View key={i} style={[s.masteryDot, i < mastery && s.masteryDotFilled]} />
                ))}
              </View>

              {/* English word */}
              <View style={s.cardCenter}>
                <Text style={s.englishText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>
                  {currentWord.english}
                </Text>
                {currentWord.pronunciation ? (
                  <Text style={s.pronunciationText}>{currentWord.pronunciation}</Text>
                ) : null}
                {currentWord.partOfSpeechTags && currentWord.partOfSpeechTags.length > 0 ? (
                  <View style={s.posRow}>
                    {currentWord.partOfSpeechTags.slice(0, 3).map((tag, i) => (
                      <View key={i} style={s.posTag}><Text style={s.posTagText}>{tag}</Text></View>
                    ))}
                  </View>
                ) : null}
              </View>

              <Text style={s.hintText}>タップして意味を表示</Text>
            </Animated.View>

            {/* Back */}
            <Animated.View style={[s.card, s.cardBack, { opacity: backOpacity }]} pointerEvents={isFlipped ? 'auto' : 'none'}>
              <ScrollView contentContainerStyle={s.backContent} showsVerticalScrollIndicator={false}>
                {/* Japanese */}
                <Text style={s.japaneseText}>{currentWord.japanese}</Text>
                <Text style={s.backEnglish}>{currentWord.english}</Text>
                {currentWord.pronunciation ? <Text style={s.backPronunciation}>{currentWord.pronunciation}</Text> : null}

                {/* Example sentence */}
                {currentWord.exampleSentence ? (
                  <View style={s.exampleSection}>
                    <Text style={s.sectionLabel}>例文</Text>
                    <Text style={s.exampleText}>{currentWord.exampleSentence}</Text>
                    {currentWord.exampleSentenceJa ? <Text style={s.exampleJa}>{currentWord.exampleSentenceJa}</Text> : null}
                  </View>
                ) : null}

                {/* Related words */}
                {currentWord.relatedWords && currentWord.relatedWords.length > 0 ? (
                  <View style={s.exampleSection}>
                    <Text style={s.sectionLabel}>関連語</Text>
                    <View style={s.tagsWrap}>
                      {currentWord.relatedWords.slice(0, 6).map((rw, i) => (
                        <View key={i} style={s.relTag}>
                          <Text style={s.relTagText}>{typeof rw === 'string' ? rw : rw.word}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </ScrollView>
              <Text style={s.hintTextBack}>タップで戻る</Text>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Action buttons row (Web-style: translate, flag, search, edit, delete) */}
      <View style={s.actionsRow}>
        <TouchableOpacity style={s.actionBtn} onPress={handleSpeak}>
          <Languages size={20} color={theme.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleToggleFavorite}>
          <Flag size={20} color={currentWord.isFavorite ? '#f97316' : theme.secondaryText} fill={currentWord.isFavorite ? '#f97316' : 'transparent'} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleSpeak}>
          <Search size={20} color={theme.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => { /* edit placeholder */ }}>
          <Pencil size={20} color={theme.secondaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={handleDeleteWord}>
          <Trash2 size={20} color={theme.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Navigation row: prev / shuffle / next */}
      <View style={s.navRow}>
        <TouchableOpacity style={[s.navBtn, currentIndex === 0 && s.navBtnDisabled]} onPress={handlePrev} disabled={currentIndex === 0 || isAnimating}>
          <ChevronLeft size={24} color={currentIndex === 0 ? theme.mutedText : theme.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={handleFlip}>
          <RotateCcw size={20} color={theme.primaryText} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.navBtn, currentIndex === words.length - 1 && s.navBtnDisabled]} onPress={handleNext} disabled={currentIndex === words.length - 1 || isAnimating}>
          <ChevronRight size={24} color={currentIndex === words.length - 1 ? theme.mutedText : theme.primaryText} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background },
  loadingText: { marginTop: 12, fontSize: 14, color: theme.secondaryText },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  progressPill: { backgroundColor: theme.surfaceAlt, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: theme.borderLight },
  progressText: { fontSize: 14, fontWeight: '600', color: theme.secondaryText, fontVariant: ['tabular-nums'] },

  // Progress bar
  progressBar: { height: 3, backgroundColor: theme.borderLight, marginHorizontal: 16 },
  progressFill: { height: 3, backgroundColor: theme.accentBlack, borderRadius: 2 },

  // Card area
  cardArea: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  cardWrap: { flex: 1 },
  cardTouchable: { flex: 1 },
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: theme.border },
  cardFront: { backgroundColor: theme.white },
  cardBack: { backgroundColor: theme.accentBlack },

  // Front card content
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  modeBadge: { backgroundColor: theme.surfaceAlt, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  modeBadgeText: { fontSize: 12, fontWeight: '600', color: theme.secondaryText },
  masteryRow: { flexDirection: 'row', gap: 4, marginTop: 12 },
  masteryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.borderLight },
  masteryDotFilled: { backgroundColor: theme.success },
  cardCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%' },
  englishText: { fontSize: 32, fontWeight: '700', color: theme.primaryText, textAlign: 'center' },
  pronunciationText: { fontSize: 15, color: theme.mutedText, fontFamily: 'monospace', textAlign: 'center' },
  posRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  posTag: { backgroundColor: 'rgba(26,26,26,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  posTagText: { fontSize: 11, fontWeight: '600', color: theme.secondaryText },
  hintText: { fontSize: 12, color: theme.mutedText, textAlign: 'center', marginTop: 8 },

  // Back card content
  backContent: { paddingTop: 20, paddingBottom: 40, gap: 16 },
  japaneseText: { fontSize: 28, fontWeight: '700', color: theme.white, textAlign: 'center' },
  backEnglish: { fontSize: 18, fontWeight: '500', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  backPronunciation: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'center' },
  exampleSection: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 },
  exampleText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
  exampleJa: { fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relTag: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  relTagText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  hintTextBack: { position: 'absolute', bottom: 16, alignSelf: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  // Action buttons (Web-style row)
  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  actionBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.borderLight, alignItems: 'center', justifyContent: 'center' },

  // Navigation row
  navRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingBottom: 16, paddingTop: 4 },
  navBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.borderLight, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.4 },
});
