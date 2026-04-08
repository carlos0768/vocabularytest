import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import theme from '../../constants/theme';

function SkeletonBone({ width, height, borderRadius = 8, style }: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: theme.borderLight, opacity },
        style,
      ]}
    />
  );
}

/** Home screen skeleton: two cards + project list placeholders */
export function HomeScreenSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBone width={120} height={28} style={styles.mb16} />
      <View style={styles.twoCol}>
        <SkeletonBone width="48%" height={150} borderRadius={16} />
        <SkeletonBone width="48%" height={150} borderRadius={16} />
      </View>
      <SkeletonBone width={140} height={20} style={styles.mb12} />
      <SkeletonBone width="100%" height={88} borderRadius={16} style={styles.mb10} />
      <SkeletonBone width="100%" height={88} borderRadius={16} style={styles.mb10} />
      <SkeletonBone width="100%" height={88} borderRadius={16} />
    </View>
  );
}

/** Project list skeleton */
export function ProjectListSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBone width={160} height={28} style={styles.mb16} />
      <SkeletonBone width="100%" height={44} borderRadius={12} style={styles.mb12} />
      <SkeletonBone width="100%" height={88} borderRadius={16} style={styles.mb10} />
      <SkeletonBone width="100%" height={88} borderRadius={16} style={styles.mb10} />
      <SkeletonBone width="100%" height={88} borderRadius={16} style={styles.mb10} />
      <SkeletonBone width="100%" height={88} borderRadius={16} />
    </View>
  );
}

/** Stats screen skeleton */
export function StatsScreenSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBone width={80} height={24} style={styles.mb16} />
      <View style={styles.twoCol}>
        <SkeletonBone width="48%" height={146} borderRadius={16} />
        <SkeletonBone width="48%" height={146} borderRadius={16} />
      </View>
      <SkeletonBone width="100%" height={200} borderRadius={16} style={styles.mb12} />
      <SkeletonBone width="100%" height={240} borderRadius={16} />
    </View>
  );
}

/** Project detail skeleton */
export function ProjectScreenSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBone width="100%" height={64} borderRadius={0} style={styles.mb16} />
      <View style={[styles.twoCol, { justifyContent: 'center', gap: 12 }]}>
        <SkeletonBone width="30%" height={60} borderRadius={12} />
        <SkeletonBone width="30%" height={60} borderRadius={12} />
        <SkeletonBone width="30%" height={60} borderRadius={12} />
      </View>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBone key={i} width="100%" height={48} borderRadius={0} style={styles.mb4} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 16,
    paddingTop: 60,
  },
  twoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mb4: { marginBottom: 4 },
  mb10: { marginBottom: 10 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
});
