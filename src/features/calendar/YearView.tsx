import { card } from '../../components/ui';
import { monthGrid } from '../../domain/calendar';
import { today } from '../../domain/dates';
import { useDays } from './useDays';

/**
 * The whole year at a glance: twelve small month grids. A day with a workout and a skipped day share
 * one colour and carry no other info ("something happened that day"); tap a month to open it.
 */
export default function YearView({ year, onPickMonth }: { year: number; onPickMonth: (month0: number) => void }) {
  const days = useDays(`${year}-01-01`, `${year}-12-31`);
  const marked = new Set(days?.filter((d) => d.status !== 'rest').map((d) => d.date));
  const t = today();

  return (
    <section className={`${card} grid grid-cols-3 gap-x-3 gap-y-5 p-3`}>
      {Array.from({ length: 12 }, (_, m) => (
        <button key={m} className="flex flex-col gap-1.5 text-left" onClick={() => onPickMonth(m)}>
          <span className="text-xs font-semibold text-neutral-300">
            {new Date(year, m).toLocaleDateString('en-GB', { month: 'short' })}
          </span>
          <span className="grid grid-cols-7 gap-[3px]">
            {monthGrid(year, m).map((date, i) => (
              <span
                key={date ?? `pad${i}`}
                className={`aspect-square rounded-[3px] ${
                  date === null ? '' : marked.has(date) ? 'bg-green-500' : 'bg-neutral-800/70'
                } ${date === t ? 'outline outline-1 outline-white' : ''}`}
              />
            ))}
          </span>
        </button>
      ))}
    </section>
  );
}
