import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../constants/colors';
import type { WordStatus } from '../../shared/types';

const BOX_SIZE = 13;
const BORDER_RADIUS = 3;
const STORAGE_PREFIX = 'notion_cb_mid_';

interface NotionCheckboxProps {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
}

/**
 * iOS の NotionCheckboxProgress に相当。
 * 3段のボックスで status を視覚的に表示し、タップで循環する。
 *
 *  new     → □□□  (0 filled)
 *  review  → ■□□ or ■■□  (1-2 filled, 2段目は AsyncStorage で管理)
 *  mastered→ ■■■  (3 filled)
 *
 * タップ: new → review(1) → review(2) → mastered → review(2) → review(1) → new → ...
 */
export function NotionCheckbox({ wordId, status, onStatusChange }: NotionCheckboxProps) {
  const [midFilled, setMidFilled] = useState(false);

  useEffect(() => {
    if (status === 'review') {
      AsyncStorage.getItem(STORAGE_PREFIX + wordId).then((val) => {
        setMidFilled(val === '1');
      });
    } else {
      setMidFilled(status === 'mastered');
    }
  }, [status, wordId]);

  const filledCount =
    status === 'mastered' ? 3 :
    status === 'review' ? (midFilled ? 2 : 1) :
    0;

  const handleTap = useCallback(async () => {
    if (status === 'new') {
      // new → review (1 filled)
      await AsyncStorage.setItem(STORAGE_PREFIX + wordId, '0');
      setMidFilled(false);
      onStatusChange('review');
    } else if (status === 'review' && !midFilled) {
      // review(1) → review(2)
      await AsyncStorage.setItem(STORAGE_PREFIX + wordId, '1');
      setMidFilled(true);
    } else if (status === 'review' && midFilled) {
      // review(2) → mastered
      await AsyncStorage.removeItem(STORAGE_PREFIX + wordId);
      onStatusChange('mastered');
    } else if (status === 'mastered') {
      // mastered → review(2)
      await AsyncStorage.setItem(STORAGE_PREFIX + wordId, '1');
      setMidFilled(true);
      onStatusChange('review');
    }
  }, [midFilled, onStatusChange, status, wordId]);

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
        <View style={[styles.box, filledCount >= 3 && styles.boxFilledGreen]} />
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
  boxFilledGreen: {
    backgroundColor: colors.gray[900],
  },
});
