import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import colors from '../../constants/colors';

interface ScanButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function ScanButton({ onPress, disabled = false }: ScanButtonProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={[styles.button, disabled && styles.disabled]}
      >
        <Camera size={28} color={colors.white} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    right: 20,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary[900],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  disabled: {
    backgroundColor: colors.gray[400],
    opacity: 0.7,
  },
});
