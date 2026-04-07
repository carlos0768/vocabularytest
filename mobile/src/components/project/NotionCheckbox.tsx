import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../constants/colors';
import type { WordStatus } from '../../shared/types';

const BOX_SIZE = 13;
const BORDER_RADIUS = 3;
const KEY_TIER2 = 'notion_cb_mid_';
const KEY_FROM_MASTERED = 'notion_cb_fromM_';
const KEY_WALKBACK = 'notion_cb_walk_';

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
export function NotionCheckbox({ wordId, status, onStatusChange }: NotionCheckboxProps) {
  const [tier2, setTier2] = useState(false);
  const [fromMastered, setFromMastered] = useState(false);
  const [walkback, setWalkback] = useState(false);

  useEffect(() => {
    if (status === 'review') {
      Promise.all([
        AsyncStorage.getItem(KEY_TIER2 + wordId),
        AsyncStorage.getItem(KEY_FROM_MASTERED + wordId),
        AsyncStorage.getItem(KEY_WALKBACK + wordId),
      ]).then(([t2, fm, wb]) => {
        setTier2(t2 === '1');
        setFromMastered(fm === '1');
        setWalkback(wb === '1');
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

  const handleTap = useCallback(async () => {
    switch (true) {
      // new → review(1)
      case status === 'new': {
        await AsyncStorage.multiSet([
          [KEY_TIER2 + wordId, '0'],
          [KEY_FROM_MASTERED + wordId, '0'],
          [KEY_WALKBACK + wordId, '0'],
        ]);
        setTier2(false);
        setFromMastered(false);
        setWalkback(false);
        onStatusChange('review');
        break;
      }

      // review(1, walkback) → new  (戻り経路: 1マス目からさらに戻る)
      case status === 'review' && !tier2 && walkback: {
        await AsyncStorage.multiRemove([
          KEY_TIER2 + wordId,
          KEY_FROM_MASTERED + wordId,
          KEY_WALKBACK + wordId,
        ]);
        setWalkback(false);
        onStatusChange('new');
        break;
      }

      // review(1, forward) → review(2)  (前進経路)
      case status === 'review' && !tier2 && !walkback: {
        await AsyncStorage.multiSet([
          [KEY_TIER2 + wordId, '1'],
          [KEY_FROM_MASTERED + wordId, '0'],
        ]);
        setTier2(true);
        setFromMastered(false);
        break;
      }

      // review(2, fromMastered) → review(1, walkback)  (戻り経路: 2↔3ループ防止)
      case status === 'review' && tier2 && fromMastered: {
        await AsyncStorage.multiSet([
          [KEY_TIER2 + wordId, '0'],
          [KEY_FROM_MASTERED + wordId, '0'],
          [KEY_WALKBACK + wordId, '1'],
        ]);
        setTier2(false);
        setFromMastered(false);
        setWalkback(true);
        break;
      }

      // review(2, forward) → mastered  (前進経路)
      case status === 'review' && tier2 && !fromMastered: {
        await AsyncStorage.multiRemove([
          KEY_TIER2 + wordId,
          KEY_FROM_MASTERED + wordId,
          KEY_WALKBACK + wordId,
        ]);
        onStatusChange('mastered');
        break;
      }

      // mastered → review(2, fromMastered)
      case status === 'mastered': {
        await AsyncStorage.multiSet([
          [KEY_TIER2 + wordId, '1'],
          [KEY_FROM_MASTERED + wordId, '1'],
          [KEY_WALKBACK + wordId, '0'],
        ]);
        setTier2(true);
        setFromMastered(true);
        setWalkback(false);
        onStatusChange('review');
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
}

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
    borderColor: colors.gray[400],
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
    borderColor: colors.gray[400],
  },
  boxFilled: {
    backgroundColor: colors.gray[900],
  },
});
