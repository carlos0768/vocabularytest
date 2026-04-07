import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LogIn } from 'lucide-react-native';
import theme from '../../constants/theme';
import { IconBadge } from './IconBadge';
import { PrimaryButton } from './PrimaryButton';

interface LoginGateViewProps {
  title?: string;
  message?: string;
  onLogin: () => void;
}

/** "Login required" placeholder — matches iOS LoginGateView */
export function LoginGateView({
  title = 'ログインが必要です',
  message = 'この機能を使うにはアカウントにログインしてください。',
  onLogin,
}: LoginGateViewProps) {
  return (
    <View style={styles.container}>
      <IconBadge
        icon={<LogIn size={28} color={theme.chartBlue} />}
        size={80}
        backgroundColor={theme.chartBlueBg}
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <PrimaryButton
        onPress={onLogin}
        title="ログイン"
        icon={<LogIn size={18} color={theme.white} />}
        fullWidth={false}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    fontSize: theme.fontSize.title2,
    fontWeight: '700',
    color: theme.primaryText,
    marginTop: 8,
  },
  message: {
    fontSize: theme.fontSize.callout,
    color: theme.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 32,
  },
});
