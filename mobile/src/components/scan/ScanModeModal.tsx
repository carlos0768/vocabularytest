import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BookOpen,
  Camera,
  Check,
  CircleDot,
  Crown,
  X,
} from 'lucide-react-native';
import colors from '../../constants/colors';

type SupportedScanMode = 'all' | 'circled' | 'eiken';

const EIKEN_LEVELS = [
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

interface ScanModeModalProps {
  visible: boolean;
  isPro: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onRequirePro: () => void;
  onSelectMode: (mode: SupportedScanMode, eikenLevel?: string | null) => void;
}

export function ScanModeModal({
  visible,
  isPro,
  title,
  subtitle,
  onClose,
  onRequirePro,
  onSelectMode,
}: ScanModeModalProps) {
  const [selectingEiken, setSelectingEiken] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectingEiken(false);
      setSelectedLevel(null);
    }
  }, [visible]);

  if (selectingEiken) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>英検レベルを選択</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <X size={18} color={colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>抽出したいレベルを選んでください。</Text>
            <ScrollView style={styles.levelList} contentContainerStyle={styles.levelListContent}>
              {EIKEN_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.value}
                  style={[
                    styles.levelRow,
                    selectedLevel === level.value && styles.levelRowSelected,
                  ]}
                  onPress={() => setSelectedLevel(level.value)}
                >
                  <Text
                    style={[
                      styles.levelLabel,
                      selectedLevel === level.value && styles.levelLabelSelected,
                    ]}
                  >
                    {level.label}
                  </Text>
                  {selectedLevel === level.value ? (
                    <Check size={18} color={colors.amber[700]} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.footerButton, styles.footerButtonSecondary]}
                onPress={() => setSelectingEiken(false)}
              >
                <Text style={styles.footerButtonSecondaryText}>戻る</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.footerButton,
                  !selectedLevel && styles.footerButtonDisabled,
                ]}
                disabled={!selectedLevel}
                onPress={() => {
                  if (!selectedLevel) return;
                  onSelectMode('eiken', selectedLevel);
                  onClose();
                }}
              >
                <Text style={styles.footerButtonText}>このレベルで進む</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={18} color={colors.gray[600]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <TouchableOpacity
            style={styles.modeRow}
            onPress={() => {
              onSelectMode('all');
              onClose();
            }}
          >
            <View style={[styles.modeIcon, { backgroundColor: 'rgba(26,26,26,0.06)' }]}>
              <Camera size={20} color={'#0d0d0d'} />
            </View>
            <View style={styles.modeCopy}>
              <Text style={styles.modeTitle}>all</Text>
              <Text style={styles.modeDescription}>写真内の英単語をまとめて抽出します。</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeRow}
            onPress={() => {
              if (!isPro) {
                onRequirePro();
                onClose();
                return;
              }
              onSelectMode('circled');
              onClose();
            }}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.purple[50] }]}>
              <CircleDot size={20} color={colors.purple[700]} />
            </View>
            <View style={styles.modeCopy}>
              <View style={styles.modeTitleRow}>
                <Text style={styles.modeTitle}>circled</Text>
                {!isPro ? <ProBadge /> : null}
              </View>
              <Text style={styles.modeDescription}>丸を付けた単語だけを抽出します。</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeRow}
            onPress={() => {
              if (!isPro) {
                onRequirePro();
                onClose();
                return;
              }
              setSelectingEiken(true);
            }}
          >
            <View style={[styles.modeIcon, { backgroundColor: colors.amber[50] }]}>
              <BookOpen size={20} color={colors.amber[700]} />
            </View>
            <View style={styles.modeCopy}>
              <View style={styles.modeTitleRow}>
                <Text style={styles.modeTitle}>eiken</Text>
                {!isPro ? <ProBadge /> : null}
              </View>
              <Text style={styles.modeDescription}>級ごとに単語を絞って抽出します。</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ProBadge() {
  return (
    <View style={styles.proBadge}>
      <Crown size={10} color={colors.white} />
      <Text style={styles.proBadgeText}>Pro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.gray[900],
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.gray[600],
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCopy: {
    flex: 1,
    gap: 4,
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray[900],
  },
  modeDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[600],
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amber[600],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  levelList: {
    maxHeight: 280,
  },
  levelListContent: {
    gap: 10,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.gray[50],
  },
  levelRowSelected: {
    borderColor: colors.amber[300],
    backgroundColor: colors.amber[50],
  },
  levelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  levelLabelSelected: {
    color: colors.amber[800],
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  footerButtonSecondary: {
    backgroundColor: colors.gray[100],
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  footerButtonSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[800],
  },
});
