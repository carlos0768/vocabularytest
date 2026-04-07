import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import theme from '../../constants/theme';

export interface SortChipOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface SortChipsProps {
  options: SortChipOption[];
  activeKey: string;
  onSelect: (key: string) => void;
}

/** Horizontal scroll filter chips — matches iOS ProjectListView sort bar */
export function SortChips({ options, activeKey, onSelect }: SortChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {options.map((opt) => {
        const isActive = opt.key === activeKey;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.7}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            {opt.icon && <View style={styles.iconWrap}>{opt.icon}</View>}
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    minWidth: 108,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: 'rgba(19,127,236,0.22)',
    backgroundColor: theme.white,
  },
  iconWrap: {
    marginRight: 6,
  },
  label: {
    fontSize: theme.fontSize.callout,
    fontWeight: '500',
    color: theme.secondaryText,
  },
  labelActive: {
    color: theme.primaryText,
    fontWeight: '600',
  },
});
