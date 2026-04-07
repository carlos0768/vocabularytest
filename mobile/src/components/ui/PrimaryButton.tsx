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

interface PrimaryButtonProps {
  onPress: () => void;
  title: string;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Full width (default true) */
  fullWidth?: boolean;
}

/** Black capsule button with 3pt bottom accent — matches iOS PrimaryGlassButton */
export function PrimaryButton({
  onPress,
  title,
  icon,
  loading = false,
  disabled = false,
  style,
  fullWidth = true,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <View style={[styles.wrapper, fullWidth && styles.fullWidth, style]}>
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        style={[styles.button, isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={theme.white} size="small" />
        ) : (
          <>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            <Text style={styles.text}>{title}</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={styles.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  fullWidth: {
    width: '100%',
  },
  button: {
    backgroundColor: theme.accentBlack,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  iconWrap: {
    marginRight: 8,
  },
  text: {
    color: theme.white,
    fontSize: theme.fontSize.headline,
    fontWeight: '700',
  },
  accent: {
    position: 'absolute',
    bottom: -3,
    left: 4,
    right: 4,
    height: 3,
    backgroundColor: theme.accentBlack,
    borderBottomLeftRadius: theme.radius.lg,
    borderBottomRightRadius: theme.radius.lg,
    opacity: 0.3,
  },
});
