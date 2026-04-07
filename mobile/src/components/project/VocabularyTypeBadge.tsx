import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import colors from '../../constants/colors';
import type { VocabularyType } from '../../shared/types';

interface VocabularyTypeBadgeProps {
  value: VocabularyType | undefined;
  onCycle: (next: VocabularyType | undefined) => void;
}

function getNext(current: VocabularyType | undefined): VocabularyType | undefined {
  if (current === undefined) return 'active';
  if (current === 'active') return 'passive';
  return undefined; // passive → nil
}

export function VocabularyTypeBadge({ value, onCycle }: VocabularyTypeBadgeProps) {
  const label = value === 'active' ? 'A' : value === 'passive' ? 'P' : '—';

  const bgColor =
    value === 'active' ? '#1a1a1a' :
    value === 'passive' ? 'rgba(107,114,128,0.5)' :
    'transparent';

  const textColor =
    value === 'active' || value === 'passive' ? '#fff' : colors.gray[400];

  const showBorder = value === undefined;

  return (
    <TouchableOpacity
      onPress={() => onCycle(getNext(value))}
      activeOpacity={0.6}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: bgColor },
          showBorder && styles.badgeBorder,
        ]}
      >
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBorder: {
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
  },
});
