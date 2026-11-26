import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Icon from '../../components/Icon';
import Sheet from '../../components/Sheet';
import { btn, card, PageHeader, SectionTitle, Stat } from '../../components/ui';
import { addDays, isoWeekday, parseLocalDate, today } from '../../domain/dates';
import { formatWeight } from '../../domain/sets';
import { templateColor, TEMPLATES, type Template } from '../../domain/templates';
import { formatDuration } from '../../domain/workout';
import { useDbQuery } from '../../hooks/useDbQuery';
import { getTemplateColors } from '../../repositories/templates';
import { startRun } from '../../repositories/templateRun';
import { getActiveWorkout, listHistory, startWorkout } from '../../repositories/workouts';
import { STATUS_NAME, STATUS_STYLE } from '../calendar/CalendarScreen';
import { useDays } from '../calendar/useDays';
import { formatDate } from '../history/HistoryScreen';

/** "Wed 25 Nov". en-US short names are always three letters (en-GB says "Sept"). */
const headerDate = (date: string) => {
  const d = parseLocalDate(date);
  const short = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', o);
  return `${short({ weekday: 'short' })} ${d.getDate()} ${short({ month: 'short' })}`;
};

/** Pressed-in look: dark inner shadow top-left, light bottom-right. */
const pressed =
  'shadow-[inset_4px_4px_8px_rgba(0,0,0,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.12)] ring-1 ring-white/10 ring-inset';

export default function TodayScreen() {
  const navigate = useNavigate();
  const t = today();
  const weekStart = addDays(t, 1 - isoWeekday(t));
  const days = useDays(weekStart, addDays(weekStart, 6));
  const active = useDbQuery(getActiveWorkout, []);
  const last = useDbQuery(async () => (await listHistory())[0] ?? null, [], { key: 'last-workout' });

  const todayInfo = days?.find((d) => d.date === t);
  const week = days ?? [];
  const weekDone = week.filter((d) => d.status === 'done').length;

  const [picking, setPicking] = useState(false);
  const colors = useDbQuery(getTemplateColors, [], { key: 'template-colors' });

  const start = async (template?: Template) => {
    const id = await startWorkout(template);
    if (template) startRun(id, template.id);
    navigate('/workout');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Today"
        subtitle={headerDate(t)}
      />

      {/* Bright inner glow on all edges; green only in the centre, the rest see-through. */}
      <section className="flex flex-col gap-4 rounded-3xl bg-radial from-[#16382c] from-25% to-transparent to-90% p-4 shadow-[inset_3px_3px_8px_rgba(255,255,255,0.04),inset_-3px_-3px_8px_rgba(255,255,255,0.04),inset_0_0_18px_rgba(255,255,255,0.07),0_1px_0_rgba(255,255,255,0.03)]">
        {todayInfo && (
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full ${
                todayInfo.workouts.length ? STATUS_STYLE[todayInfo.status] : `bg-black/35 text-neutral-400 ${pressed}`
              }`}>
              <Icon name={todayInfo.workouts.length ? 'check' : 'dumbbell'} />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold">{STATUS_NAME[todayInfo.status]}</p>
              <p className="text-sm text-neutral-400">
                {todayInfo.workouts.length ? todayInfo.workouts.map((w) => w.title).join(', ') : 'Trust the process.'}
              </p>
            </div>
          </div>
        )}
        {active === undefined ? null : active ? (
          <Link to="/workout" className={`${btn.primary} text-lg active:scale-100!`}>
            <Icon name="play" className="h-6 w-6" />
            Continue workout
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button className={`group ${btn.primary} bg-radial! from-green-400/70! from-20% to-[#8bd83c]/20! px-2! text-base whitespace-nowrap shadow-[4px_4px_8px_rgba(0,0,0,0.45)] ring-1 ring-white/30 ring-inset active:scale-95!`} onClick={() => start()}>
              <span className="inline-flex items-center gap-1.5 transition group-active:scale-90">
                <Icon name="play" className="-ml-2 h-6 w-6" />
                Start workout
              </span>
            </button>
            <button className={`group ${btn.secondary} bg-black/35! text-base ${pressed} active:scale-100! active:bg-black/50! active:shadow-[inset_7px_7px_14px_rgba(0,0,0,0.85),inset_-2px_-2px_4px_rgba(255,255,255,0.12)]`} onClick={() => setPicking(true)}>
              <span className="transition group-active:scale-90">From template</span>
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <SectionTitle>This week</SectionTitle>
          {weekDone > 0 && <span className="text-xs text-neutral-500">{weekDone} done</span>}
        </div>
        <Link to="/calendar" className={`${card} grid grid-cols-7 gap-1 p-3`}>
          {week.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] font-medium text-neutral-500">
                {parseLocalDate(d.date).toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${STATUS_STYLE[d.status]} ${
                  d.date === t ? 'outline-2 outline-offset-2 outline-white' : ''
                }`}
              >
                {Number(d.date.slice(8))}
              </span>
            </div>
          ))}
        </Link>
      </section>

      {last && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Last workout</SectionTitle>
          <Link to={`/history/${last.id}`} className={`${card} flex flex-col gap-3 p-4 active:bg-neutral-800`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{last.title}</span>
              <span className="shrink-0 text-sm text-neutral-400">{formatDate(last.date)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon="clock" label="Duration" value={formatDuration((Date.parse(last.finishedAt!) - Date.parse(last.startedAt)) / 1000)} />
              <Stat icon="weight" label="Volume" value={`${formatWeight(last.volume)} kg`} />
              <Stat icon="dumbbell" label="Exercises" value={String(last.exercises.length)} />
            </div>
          </Link>
        </section>
      )}

      {picking && (
        <Sheet title="Templates" onClose={() => setPicking(false)}>
          <ul className={`${card} divide-y divide-white/[0.06]`}>
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left" onClick={() => start(t)}>
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ background: templateColor(t.id, colors) }} />
                    {t.name}
                  </span>
                  <span className="text-sm text-neutral-400">{t.slots.map((s) => s.name).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* Does nothing yet: template editing comes later. */}
          <button className={`${btn.secondary} mt-3`}>
            <Icon name="add" className="h-5 w-5" />
            Create template
          </button>
        </Sheet>
      )}
    </div>
  );
}
