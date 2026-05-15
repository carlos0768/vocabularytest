import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import theme from '../../constants/theme';

interface SolidCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
  highlighted?: boolean;
  flat?: boolean;
}

/** Rounded card with border + subtle shadow — matches iOS SolidCard */
export function SolidCard({
  children,
  style,
  bordered = true,
  highlighted = false,
  flat = false,
}: SolidCardProps) {
  return (
    <View
      style={[
        styles.card,
        bordered && styles.bordered,
        highlighted && styles.highlighted,
        !flat && styles.shadow,
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
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
  },
  bordered: {
    borderWidth: 1.25,
    borderColor: theme.solidBorder,
  },
  highlighted: {
    borderColor: theme.accentGreen,
    borderWidth: 1.25,
  },
  shadow: {
    shadowColor: theme.solidShadow,
    shadowOpacity: 1,
    shadowOffset: { width: 2.5, height: 3 },
    shadowRadius: 0,
    elevation: 3,
  },
});
