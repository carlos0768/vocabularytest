'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

type ColorVariant = 'red' | 'blue' | 'green' | 'purple' | 'orange';

interface StudyModeCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  variant: ColorVariant;
  disabled?: boolean;
  badge?: string;
}

const variantStyles: Record<ColorVariant, { border: string; bg: string; iconBg: string; iconColor: string }> = {
  red: {
    border: 'border-red-200',
    bg: 'bg-red-50/50',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  blue: {
    border: 'border-blue-200',
    bg: 'bg-blue-50/50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  green: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  purple: {
    border: 'border-purple-200',
    bg: 'bg-purple-50/50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  orange: {
    border: 'border-orange-200',
    bg: 'bg-orange-50/50',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
};

export function StudyModeCard({
  title,
  description,
  icon: Icon,
  href,
  variant,
  disabled = false,
  badge,
}: StudyModeCardProps) {
  const styles = variantStyles[variant];

  const content = (
    <div
      className={`relative p-3 rounded-2xl border-2 ${styles.border} ${styles.bg} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md transition-shadow cursor-pointer'
      }`}
    >
      {badge && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium rounded-full">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-xl ${styles.iconBg} flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${styles.iconColor}`} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm whitespace-nowrap">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">{description}</p>
        </div>
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}
