import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import Icon, { type IconName } from './Icon';

// Shared look: dark surfaces, one green accent, Material Symbols icons (components/Icon).

export const card = 'rounded-3xl bg-neutral-900 ring-1 ring-neutral-700/70 shadow-[0_12px_28px_rgba(0,0,0,0.28)]';

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-linear-to-br from-green-400 to-[#8bd83c] px-4 py-3.5 font-bold text-[#172012] transition active:scale-[0.98] active:brightness-90 disabled:opacity-40',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-neutral-800 px-4 py-3 font-medium text-neutral-100 transition active:scale-[0.98] active:bg-neutral-700',
  danger:
    'inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 font-medium text-red-400 transition active:scale-[0.98] active:bg-red-500/20',
  icon: 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-200 transition active:bg-neutral-700',
  chip: (on: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      on ? 'bg-linear-to-br from-green-400 to-[#8bd83c] font-bold text-[#172012]' : 'bg-neutral-800 text-neutral-300 active:bg-neutral-700'
    }`,
};

export const input =
  'w-full rounded-xl bg-neutral-800/80 px-3.5 py-3 text-base text-neutral-100 outline-none ring-1 ring-white/[0.04] placeholder:text-neutral-500 focus:ring-2 focus:ring-green-500';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        {subtitle && <p className="text-sm font-medium text-green-500">{subtitle}</p>}
        <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function BackButton({ label = 'Back' }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <button className="-ml-1.5 inline-flex items-center self-start text-green-500" onClick={() => navigate(-1)}>
      <Icon name="back" className="h-6 w-6" />
      {label}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">{children}</h2>;
}

export function Stat({ icon, label, value }: { icon?: IconName; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-center gap-1 text-xs text-neutral-400">
        {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="truncate font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** iOS-style grouped list row. */
export function Row({
  icon,
  iconBg = 'bg-neutral-700',
  title,
  detail,
  onClick,
  chevron = false,
  children,
}: {
  icon: IconName;
  iconBg?: string;
  title: string;
  detail?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${iconBg}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">{title}</span>
      {detail && <span className="truncate text-sm text-neutral-400">{detail}</span>}
      {children}
      {chevron && <Icon name="chevronRight" className="h-5 w-5 text-neutral-600" />}
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3';
  return onClick ? (
    <button className={`${cls} active:bg-neutral-800`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-green-500' : 'bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}
