import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import theme from '../../constants/theme';

interface GhostButtonProps {
  onPress: () => void;
  title: string;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

/** Bordered surface button — matches iOS GhostGlassButton */
export function GhostButton({
  onPress,
  title,
  icon,
  loading = false,
  disabled = false,
  style,
  color = theme.primaryText,
}: GhostButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[styles.button, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={theme.secondaryText} size="small" />
      ) : (
        <>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={[styles.text, { color }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  iconWrap: {
    marginRight: 8,
  },
  text: {
    fontSize: theme.fontSize.body,
    fontWeight: '600',
  },
});
