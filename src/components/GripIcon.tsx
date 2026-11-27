import type { ReactNode } from 'react';
import type { Grip } from '../domain/exercises';

// Small line drawings of each grip: a cable coming down to the handle, with the hands as green dots
// (hand positions on the bar show wide / normal / narrow).
const hands = (...pts: [number, number][]) =>
  pts.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r={2.4} fill="var(--grip-hand, #b6ed5d)" stroke="none" />);
const bar = (xs: [number, number]) => (
  <>
    <path d="M12 2v7M2 9h20" />
    {hands([xs[0], 9], [xs[1], 9])}
  </>
);
const parallel = (x: number) => (
  <>
    <path d={`M12 2v6M${12 - x} 8h${2 * x}M${12 - x} 8v11M${12 + x} 8v11`} />
    {hands([12 - x, 14], [12 + x, 14])}
  </>
);

const DRAWING: Record<Grip, ReactNode> = {
  wide: bar([4, 20]),
  normal: bar([8, 16]),
  narrow: bar([10.5, 13.5]),
  parallel_wide: parallel(7),
  parallel_normal: parallel(4),
  rope: (
    <>
      <path d="M12 2v6M12 8 7 20M12 8l5 12M5.5 20h3M15.5 20h3" />
      {hands([7, 19], [17, 19])}
    </>
  ),
  v_bar: (
    <>
      <path d="M12 2v4M12 6 4 16M12 6l8 10M2 16h4M18 16h4" />
      {hands([4, 16], [20, 16])}
    </>
  ),
  straight_bar: (
    <>
      <path d="M12 2v10M3 12h18" />
      {hands([6, 12], [18, 12])}
    </>
  ),
  single_hand: (
    <>
      <path d="M12 2v6M8 8h8v6a4 4 0 0 1-8 0z" />
      {hands([12, 8])}
    </>
  ),
};

export default function GripIcon({ grip, className = 'h-6 w-6' }: { grip: Grip; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {DRAWING[grip]}
    </svg>
  );
}
