import React, { useState } from 'react';
import {
  TextInput,
  View,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import theme from '../../constants/theme';

interface SolidTextFieldProps extends TextInputProps {
  icon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Styled text field matching iOS solidTextField modifier */
export function SolidTextField({
  icon,
  containerStyle,
  style,
  ...props
}: SolidTextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        focused && styles.containerFocused,
        containerStyle,
      ]}
    >
      {icon && <View style={styles.iconWrap}>{icon}</View>}
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={theme.mutedText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  containerFocused: {
    borderColor: theme.chartBlue,
    backgroundColor: theme.white,
  },
  iconWrap: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: theme.fontSize.body,
    color: theme.primaryText,
    padding: 0,
  },
});
