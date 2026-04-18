import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import colors from '../../constants/colors';

interface MasteryDonutProps {
  masteredCount: number;
  reviewCount: number;
  newCount: number;
}

const SIZE = 96;
const STROKE_WIDTH = 14;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function MasteryDonut({ masteredCount, reviewCount, newCount }: MasteryDonutProps) {
  const total = masteredCount + reviewCount + newCount;
  const masteredFrac = total > 0 ? masteredCount / total : 0;
  const reviewFrac = total > 0 ? reviewCount / total : 0;
  const masteryPercent = total > 0 ? Math.round(masteredFrac * 100) : 0;

  const masteredLen = CIRCUMFERENCE * masteredFrac;
  const reviewLen = CIRCUMFERENCE * reviewFrac;
  const reviewOffset = CIRCUMFERENCE - masteredLen;

  return (
    <View style={styles.container}>
      {/* Donut */}
      <View style={styles.donutWrapper}>
        <Svg width={SIZE} height={SIZE}>
          {/* Background track */}
          <SvgCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.gray[200]}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/* Mastered (green) */}
          {masteredFrac > 0 && (
            <SvgCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.emerald[500]}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={`${masteredLen} ${CIRCUMFERENCE - masteredLen}`}
              strokeLinecap="butt"
              rotation={-90}
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          )}
          {/* Review (orange) */}
          {reviewFrac > 0 && (
            <SvgCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.orange[500]}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={`${reviewLen} ${CIRCUMFERENCE - reviewLen}`}
              strokeDashoffset={reviewOffset}
              strokeLinecap="butt"
              rotation={-90}
              origin={`${SIZE / 2}, ${SIZE / 2}`}
            />
          )}
        </Svg>
        {/* Center label */}
        <View style={styles.centerLabel}>
          <Text style={styles.percentText}>{masteryPercent}%</Text>
          <Text style={styles.percentSubtext}>習得</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendItem color={colors.emerald[500]} label="習得" count={masteredCount} />
        <LegendItem color={colors.orange[500]} label="学習中" count={reviewCount} />
        <LegendItem color={colors.gray[200]} label="未学習" count={newCount} />
      </View>
    </View>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendLeft}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendLabel}>{label}</Text>
      </View>
      <Text style={styles.legendCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
  },
  donutWrapper: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  percentText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.gray[900],
  },
  percentSubtext: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.gray[500],
  },
  legend: {
    width: '100%',
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: colors.gray[500],
  },
  legendCount: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gray[900],
  },
});
