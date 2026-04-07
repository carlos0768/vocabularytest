import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '../../constants/theme';

interface IconBadgeProps {
  icon: React.ReactNode;
  size?: number;
  backgroundColor?: string;
}

/** Circular badge with colored background and centered icon — matches iOS IconBadge */
export function IconBadge({
  icon,
  size = 32,
  backgroundColor = theme.chartBlueBg,
}: IconBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
