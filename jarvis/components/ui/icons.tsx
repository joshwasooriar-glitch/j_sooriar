/**
 * Inline stroke icons. No icon library: fifteen glyphs do not justify a dependency.
 */

import type { SVGProps } from "react";

const PATHS = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  check: "M5 4h14v16H5zM9 12l2 2 4-4",
  timeline: "M4 6h10M4 12h16M4 18h7M17 6h3M14 18h6",
  ledger: "M5 5c0-1 3-2 7-2s7 1 7 2v14c0 1-3 2-7 2s-7-1-7-2zM5 5c0 1 3 2 7 2s7-1 7-2M5 12c0 1 3 2 7 2s7-1 7-2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  folder: "M3 6h6l2 2h10v11H3z",
  memory: "M12 3c3 0 5 2 5 5 0 2-1 3-1 5v3H8v-3c0-2-1-3-1-5 0-3 2-5 5-5zM9 20h6",
  jobs: "M8 4h8v4H8zM5 8h14v12H5zM9 13h6",
  dollar: "M12 3v18M16 7c0-1.5-1.8-2.5-4-2.5S8 5.5 8 7s1.5 2.3 4 3 4 1.5 4 3.5-1.8 3-4 3-4-1-4-2.5",
  mic: "M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4",
  trend: "M4 16l5-5 4 4 7-7M15 8h5v5",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  plus: "M12 5v14M5 12h14",
  timer: "M12 8v5l3 2M9 3h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  chat: "M4 5h16v11H9l-5 4z",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zm0-13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  cap: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-7z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
