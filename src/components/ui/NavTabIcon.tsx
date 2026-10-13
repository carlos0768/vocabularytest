/** ナビタブのアイコン。`src/lib/navigation/tabs.ts` の path 文字列を描く */
export function NavTabIcon({
  path,
  filled = false,
  size = 22,
  strokeWidth = 2,
}: {
  path: string;
  filled?: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
