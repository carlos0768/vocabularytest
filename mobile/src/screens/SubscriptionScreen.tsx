import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Check,
  X,
  Crown,
  Camera,
  Cloud,
  Smartphone,
  Shield,
} from 'lucide-react-native';
import { Button } from '../components/ui';
import colors from '../constants/colors';
import type { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PlanFeature {
  icon: React.ReactNode;
  label: string;
  freeValue: string | boolean;
  proValue: string | boolean;
}

const features: PlanFeature[] = [
  {
    icon: <Camera size={20} color={colors.gray[600]} />,
    label: '1日のスキャン回数',
    freeValue: '3回',
    proValue: '無制限',
  },
  {
    icon: <Cloud size={20} color={colors.gray[600]} />,
    label: 'クラウド同期',
    freeValue: false,
    proValue: true,
  },
  {
    icon: <Smartphone size={20} color={colors.gray[600]} />,
    label: '複数デバイス対応',
    freeValue: false,
    proValue: true,
  },
  {
    icon: <Shield size={20} color={colors.gray[600]} />,
    label: 'データバックアップ',
    freeValue: false,
    proValue: true,
  },
];

export function SubscriptionScreen() {
  const navigation = useNavigation<NavigationProp>();

  const handleSubscribe = () => {
    Alert.alert(
      '開発中',
      'サブスクリプション機能は現在開発中です。しばらくお待ちください。'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.gray[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>プランを選択</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Pro Plan Card */}
        <View style={styles.proPlanCard}>
          <View style={styles.proPlanHeader}>
            <View style={styles.crownIcon}>
              <Crown size={24} color={colors.amber[600]} />
            </View>
            <Text style={styles.proPlanTitle}>Pro プラン</Text>
          </View>
          <View style={styles.proPlanPrice}>
            <Text style={styles.proPlanCurrency}>¥</Text>
            <Text style={styles.proPlanAmount}>500</Text>
            <Text style={styles.proPlanPeriod}>/月</Text>
          </View>
          <Text style={styles.proPlanDescription}>
            無制限スキャンとクラウド同期で学習効率を最大化
          </Text>
        </View>

        {/* Feature Comparison */}
        <View style={styles.comparisonSection}>
          <View style={styles.comparisonHeader}>
            <View style={styles.comparisonHeaderEmpty} />
            <Text style={styles.comparisonHeaderLabel}>Free</Text>
            <Text style={[styles.comparisonHeaderLabel, styles.comparisonHeaderLabelPro]}>
              Pro
            </Text>
          </View>

          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureLabel}>
                {feature.icon}
                <Text style={styles.featureLabelText}>{feature.label}</Text>
              </View>
              <View style={styles.featureValue}>
                {typeof feature.freeValue === 'boolean' ? (
                  feature.freeValue ? (
                    <Check size={18} color={colors.emerald[500]} />
                  ) : (
                    <X size={18} color={colors.gray[300]} />
                  )
                ) : (
                  <Text style={styles.featureValueText}>{feature.freeValue}</Text>
                )}
              </View>
              <View style={[styles.featureValue, styles.featureValuePro]}>
                {typeof feature.proValue === 'boolean' ? (
                  feature.proValue ? (
                    <Check size={18} color={colors.emerald[500]} />
                  ) : (
                    <X size={18} color={colors.gray[300]} />
                  )
                ) : (
                  <Text style={[styles.featureValueText, styles.featureValueTextPro]}>
                    {feature.proValue}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Subscribe Button */}
        <Button
          onPress={handleSubscribe}
          size="lg"
          style={styles.subscribeButton}
          icon={<Crown size={20} color={colors.white} />}
        >
          Proプランに登録
        </Button>

        {/* Current Plan */}
        <View style={styles.currentPlan}>
          <View style={styles.currentPlanBadge}>
            <Text style={styles.currentPlanBadgeText}>現在のプラン</Text>
          </View>
          <Text style={styles.currentPlanText}>Free プラン</Text>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          いつでもキャンセル可能。決済はアプリ内課金で処理されます。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
    marginLeft: 12,
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  proPlanCard: {
    backgroundColor: colors.amber[50],
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.amber[200],
    marginBottom: 32,
  },
  proPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  crownIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.amber[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  proPlanTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.amber[900],
  },
  proPlanPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  proPlanCurrency: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.amber[700],
  },
  proPlanAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.amber[700],
  },
  proPlanPeriod: {
    fontSize: 16,
    color: colors.amber[600],
    marginLeft: 4,
  },
  proPlanDescription: {
    fontSize: 14,
    color: colors.amber[700],
    textAlign: 'center',
    lineHeight: 20,
  },
  comparisonSection: {
    marginBottom: 32,
  },
  comparisonHeader: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  comparisonHeaderEmpty: {
    flex: 1,
  },
  comparisonHeaderLabel: {
    width: 60,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[500],
  },
  comparisonHeaderLabelPro: {
    color: colors.amber[600],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  featureLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureLabelText: {
    fontSize: 14,
    color: colors.gray[700],
  },
  featureValue: {
    width: 60,
    alignItems: 'center',
  },
  featureValuePro: {
    backgroundColor: colors.amber[50],
    borderRadius: 8,
    paddingVertical: 4,
    marginVertical: -4,
  },
  featureValueText: {
    fontSize: 14,
    color: colors.gray[600],
  },
  featureValueTextPro: {
    color: colors.amber[700],
    fontWeight: '600',
  },
  subscribeButton: {
    marginBottom: 24,
  },
  currentPlan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  currentPlanBadge: {
    backgroundColor: colors.gray[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currentPlanBadgeText: {
    fontSize: 12,
    color: colors.gray[500],
  },
  currentPlanText: {
    fontSize: 14,
    color: colors.gray[700],
    fontWeight: '500',
  },
  terms: {
    fontSize: 12,
    color: colors.gray[400],
    textAlign: 'center',
    lineHeight: 18,
  },
});
