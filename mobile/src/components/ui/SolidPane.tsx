import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import theme from '../../constants/theme';

interface SolidPaneProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Flat card variant (no shadow) — matches iOS SolidPane */
export function SolidPane({ children, style }: SolidPaneProps) {
  return <View style={[styles.pane, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  pane: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.border,
    padding: theme.spacing.lg,
  },
});
