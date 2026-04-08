import React, { useCallback, useEffect, useState } from 'react';
import { InteractionManager, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../constants/colors';
import type { WordStatus } from '../../shared/types';

const BOX_SIZE = 13;
const BORDER_RADIUS = 3;
const KEY_TIER2 = 'notion_cb_mid_';
const KEY_FROM_MASTERED = 'notion_cb_fromM_';
const KEY_WALKBACK = 'notion_cb_walk_';

// In-memory cache to avoid AsyncStorage read latency on remount
const flagCache = new Map<string, { tier2: boolean; fromMastered: boolean; walkback: boolean }>();

interface NotionCheckboxProps {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
}

/**
 * iOS の NotionCheckboxProgress + advanceNotionCheckbox を完全再現。
 *
 * 前進: new(0) → review(1) → review(2) → mastered(3)
 * 後退: mastered(3) → review(2,fromMastered) → review(1,walkback) → new(0)
 *
 * fromMastered フラグで 2↔3 のループを防止。
 */
export const NotionCheckbox = React.memo(function NotionCheckbox({
  wordId,
  status,
  onStatusChange,
}: NotionCheckboxProps) {
  const [tier2, setTier2] = useState(() => flagCache.get(wordId)?.tier2 ?? false);
  const [fromMastered, setFromMastered] = useState(() => flagCache.get(wordId)?.fromMastered ?? false);
  const [walkback, setWalkback] = useState(() => flagCache.get(wordId)?.walkback ?? false);

  useEffect(() => {
    if (status === 'review') {
      // Hydrate from cache synchronously (already done via initializer),
      // then reconcile with AsyncStorage in background
      const cached = flagCache.get(wordId);
      if (cached) {
        setTier2(cached.tier2);
        setFromMastered(cached.fromMastered);
        setWalkback(cached.walkback);
      }
      Promise.all([
        AsyncStorage.getItem(KEY_TIER2 + wordId),
        AsyncStorage.getItem(KEY_FROM_MASTERED + wordId),
        AsyncStorage.getItem(KEY_WALKBACK + wordId),
      ]).then(([t2, fm, wb]) => {
        const flags = { tier2: t2 === '1', fromMastered: fm === '1', walkback: wb === '1' };
        flagCache.set(wordId, flags);
        setTier2(flags.tier2);
        setFromMastered(flags.fromMastered);
        setWalkback(flags.walkback);
      });
    } else {
      setTier2(false);
      setFromMastered(false);
      setWalkback(false);
    }
  }, [status, wordId]);

  const filledCount =
    status === 'mastered' ? 3 :
    status === 'review' ? (tier2 ? 2 : 1) :
    0;

  const handleTap = useCallback(() => {
    // Optimistic UI: update state synchronously first, persist in background
    switch (true) {
      // new → review(1)
      case status === 'new': {
        const flags = { tier2: false, fromMastered: false, walkback: false };
        flagCache.set(wordId, flags);
        setTier2(false);
        setFromMastered(false);
        setWalkback(false);
        onStatusChange('review');
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiSet([
            [KEY_TIER2 + wordId, '0'],
            [KEY_FROM_MASTERED + wordId, '0'],
            [KEY_WALKBACK + wordId, '0'],
          ]).catch(console.error);
        });
        break;
      }

      // review(1, walkback) → new
      case status === 'review' && !tier2 && walkback: {
        flagCache.delete(wordId);
        setWalkback(false);
        onStatusChange('new');
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiRemove([
            KEY_TIER2 + wordId,
            KEY_FROM_MASTERED + wordId,
            KEY_WALKBACK + wordId,
          ]).catch(console.error);
        });
        break;
      }

      // review(1, forward) → review(2)
      case status === 'review' && !tier2 && !walkback: {
        const flags = { tier2: true, fromMastered: false, walkback: false };
        flagCache.set(wordId, flags);
        setTier2(true);
        setFromMastered(false);
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiSet([
            [KEY_TIER2 + wordId, '1'],
            [KEY_FROM_MASTERED + wordId, '0'],
          ]).catch(console.error);
        });
        break;
      }

      // review(2, fromMastered) → review(1, walkback)
      case status === 'review' && tier2 && fromMastered: {
        const flags = { tier2: false, fromMastered: false, walkback: true };
        flagCache.set(wordId, flags);
        setTier2(false);
        setFromMastered(false);
        setWalkback(true);
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiSet([
            [KEY_TIER2 + wordId, '0'],
            [KEY_FROM_MASTERED + wordId, '0'],
            [KEY_WALKBACK + wordId, '1'],
          ]).catch(console.error);
        });
        break;
      }

      // review(2, forward) → mastered
      case status === 'review' && tier2 && !fromMastered: {
        flagCache.delete(wordId);
        onStatusChange('mastered');
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiRemove([
            KEY_TIER2 + wordId,
            KEY_FROM_MASTERED + wordId,
            KEY_WALKBACK + wordId,
          ]).catch(console.error);
        });
        break;
      }

      // mastered → review(2, fromMastered)
      case status === 'mastered': {
        const flags = { tier2: true, fromMastered: true, walkback: false };
        flagCache.set(wordId, flags);
        setTier2(true);
        setFromMastered(true);
        setWalkback(false);
        onStatusChange('review');
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.multiSet([
            [KEY_TIER2 + wordId, '1'],
            [KEY_FROM_MASTERED + wordId, '1'],
            [KEY_WALKBACK + wordId, '0'],
          ]).catch(console.error);
        });
        break;
      }
    }
  }, [status, tier2, fromMastered, walkback, onStatusChange, wordId]);

  return (
    <TouchableOpacity
      onPress={handleTap}
      activeOpacity={0.6}
      style={styles.container}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View style={styles.stack}>
        <View style={[styles.box, filledCount >= 1 && styles.boxFilled]} />
        <View style={[styles.box, styles.boxMiddle, filledCount >= 2 && styles.boxFilled]} />
        <View style={[styles.box, filledCount >= 3 && styles.boxFilled]} />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    width: BOX_SIZE,
    borderRadius: BORDER_RADIUS,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  box: {
    width: BOX_SIZE - 2,
    height: BOX_SIZE - 2,
    backgroundColor: 'transparent',
  },
  boxMiddle: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gray[200],
  },
  boxFilled: {
    backgroundColor: colors.gray[900],
  },
});
