import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import theme from '../../constants/theme';

interface SolidCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
  highlighted?: boolean;
}

/** Rounded card with border + subtle shadow — matches iOS SolidCard */
export function SolidCard({
  children,
  style,
  bordered = true,
  highlighted = false,
}: SolidCardProps) {
  return (
    <View
      style={[
        styles.card,
        bordered && styles.bordered,
        highlighted && styles.highlighted,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  bordered: {
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  highlighted: {
    borderColor: theme.chartBlue,
    borderWidth: 1.5,
  },
});
