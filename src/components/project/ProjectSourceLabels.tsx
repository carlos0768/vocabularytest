'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSourceLabels } from '../../../shared/source-labels';

interface ProjectSourceLabelsProps {
  labels: string[];
  className?: string;
}

const CHIP_GAP = 6;
const CHIP_HORIZONTAL_PADDING = 18;
const CHIP_FONT = '600 11px system-ui';
let textMeasureCanvas: HTMLCanvasElement | null = null;

function measureChipWidth(label: string): number {
  if (typeof document === 'undefined') {
    return label.length * 12 + CHIP_HORIZONTAL_PADDING;
  }

  const canvas = textMeasureCanvas ?? document.createElement('canvas');
  textMeasureCanvas = canvas;

  const context = canvas.getContext('2d');
  if (!context) {
    return label.length * 12 + CHIP_HORIZONTAL_PADDING;
  }

  context.font = CHIP_FONT;
  return Math.ceil(context.measureText(label).width) + CHIP_HORIZONTAL_PADDING;
}

function fitsWithinRows(widths: number[], containerWidth: number, maxRows: number): boolean {
  let row = 1;
  let rowWidth = 0;

  for (const width of widths) {
    const nextWidth = rowWidth === 0 ? width : rowWidth + CHIP_GAP + width;
    if (nextWidth > containerWidth && rowWidth > 0) {
      row += 1;
      rowWidth = width;
    } else {
      rowWidth = nextWidth;
    }

    if (row > maxRows) return false;
  }

  return true;
}

function getVisibleLabels(labels: string[], containerWidth: number): { visible: string[]; hiddenCount: number } {
  if (containerWidth <= 0 || labels.length <= 1) {
    return { visible: labels, hiddenCount: 0 };
  }

  const measured = labels.map((label) => measureChipWidth(label));

  for (let visibleCount = labels.length; visibleCount >= 0; visibleCount -= 1) {
    const hiddenCount = labels.length - visibleCount;
    const widths = measured.slice(0, visibleCount);

    if (hiddenCount > 0) {
      widths.push(measureChipWidth(`+${hiddenCount}`));
    }

    if (fitsWithinRows(widths, containerWidth, 2)) {
      return {
        visible: labels.slice(0, visibleCount),
        hiddenCount,
      };
    }
  }

  return { visible: [], hiddenCount: labels.length };
}

export function ProjectSourceLabels({ labels, className }: ProjectSourceLabelsProps) {
  const normalizedLabels = useMemo(() => normalizeSourceLabels(labels), [labels]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      setContainerWidth(element.clientWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const { visible, hiddenCount } = useMemo(
    () => getVisibleLabels(normalizedLabels, containerWidth),
    [containerWidth, normalizedLabels]
  );

  if (normalizedLabels.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={className}>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((label) => (
          <span
            key={label}
            className="inline-flex max-w-full items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[var(--color-muted)]"
            title={label}
          >
            <span className="truncate">{label}</span>
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[var(--color-muted)]">
            +{hiddenCount}
          </span>
        )}
      </div>
    </div>
  );
}
