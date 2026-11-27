import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Icon from '../../components/Icon';
import MuscleIcon from '../../components/MuscleIcon';
import { BackButton, btn, card, Row, SectionTitle } from '../../components/ui';
import { parseLocalDate, today } from '../../domain/dates';
import { personalRecords, RANGES, rangeStart, sessionStats, type Range, type SessionStats } from '../../domain/progress';
import { formatSet, formatWeight, setLabels } from '../../domain/sets';
import { useDbQuery } from '../../hooks/useDbQuery';
import { getCatalogEntry } from '../../repositories/catalog';
import {
  getExercise,
  GRIP_NAMES,
  GRIPS,
  label,
  linkExercise,
  listExercises,
  removeExercise,
  setExerciseImage,
  setFavorite,
  setGripSet,
  unarchiveExercise,
  type Grip,
} from '../../repositories/exercises';
import { sessionsByExercise } from '../../repositories/progress';
import ExercisePicker from '../exercises/ExercisePicker';
import { GripSetPicker } from '../exercises/NewExerciseSheet';
import { photoToDataUrl } from '../exercises/photo';
import { formatDate } from '../history/HistoryScreen';
import { SET_TYPE_COLOR } from '../workout/SetRow';
import ExerciseAbout, { ExercisePoses } from './ExerciseAbout';

const METRICS = {
  topWeight: 'Top weight',
  e1rm: 'Est. 1RM',
  volume: 'Volume',
} as const;
type Metric = keyof typeof METRICS;

const shortDate = (d: string) => parseLocalDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Keyed by id so a related exercise starts with fresh tabs and filters.
export default function ExerciseProgressScreen() {
  const id = Number(useParams().id);
  return <Exercise key={id} id={id} />;
}

function Exercise({ id }: { id: number }) {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('3M');
  const [metric, setMetric] = useState<Metric>('topWeight');
  const [grip, setGrip] = useState<Grip | 'all'>('all');
  const [tab, setTab] = useState<'about' | 'progress'>('about');
  const [linking, setLinking] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const data = useDbQuery(async () => {
    const [exercise, sessions] = await Promise.all([getExercise(id), sessionsByExercise({ exerciseId: id })]);
    return { exercise, sessions: sessions.get(id) ?? [] };
  }, [id], { key: 'exercise-progress' });
  const catalogId = data?.exercise?.catalogId;
  // Reference data: fetched once per visit, not after every change.
  const entry = useDbQuery(
    async () => (catalogId ? getCatalogEntry(catalogId) : undefined),
    [catalogId],
    { key: 'catalog-entry', refetch: false },
  );
  const loaded = !!data;
  useEffect(() => top.current?.scrollIntoView(), [loaded]);

  if (!data) return null;
  const { exercise, sessions: allSessions } = data;
  if (!exercise) return <Navigate to="/exercises" replace />;

  // Grip filter only lists grips that actually appear in the history.
  const usedGrips = GRIPS.filter((g) => allSessions.some((s) => s.grip === g));
  const sessions = grip === 'all' ? allSessions : allSessions.filter((s) => s.grip === grip);
  const stats = sessions.map(sessionStats).filter((s): s is SessionStats => s !== null);
  const from = rangeStart(range, today());
  const shown = stats.filter((s) => s.date >= from);
  const pr = personalRecords(stats);
  // Exercises without a catalog entry (custom ones) only have their history to show.
  const about = !!catalogId && tab === 'about';

  const link = async (otherId: number) => {
    setLinking(false);
    const target = (await listExercises()).find((e) => e.id === otherId)?.catalogId;
    if (!target) return;
    try {
      await linkExercise(id, target);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not link the exercise.');
    }
  };

  const remove = async () => {
    const msg = exercise.isCustom
      ? 'Remove this exercise? (It is archived instead if it has history.)'
      : 'Archive this exercise? It will be hidden from lists; history stays.';
    if (!confirm(msg)) return;
    await removeExercise(id);
    navigate('/exercises', { replace: true });
  };

  return (
    <div ref={top} className="flex flex-col gap-4">
      <BackButton />
      {about && entry ? (
        <ExercisePoses entry={entry} />
      ) : (
        !catalogId &&
        exercise.image && (
          <img src={exercise.image} alt={exercise.name} className="aspect-[3/2] w-full rounded-2xl bg-white object-cover" />
        )
      )}
      <div className="flex items-center gap-3">
        <MuscleIcon group={exercise.muscleGroup} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl leading-tight font-bold tracking-tight">{exercise.name}</h1>
          <p className="text-sm text-neutral-400">
            {label(exercise.muscleGroup)} · {label(exercise.equipment)}
            {exercise.archived ? ' · Archived' : ''}
          </p>
        </div>
        <button
          className={`${btn.icon} ${exercise.favorite ? 'text-amber-400' : 'text-neutral-500'}`}
          onClick={() => setFavorite(id, !exercise.favorite)}
          aria-label={exercise.favorite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Icon name={exercise.favorite ? 'star' : 'starOutline'} className="h-6 w-6" />
        </button>
      </div>

      {catalogId && (
        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(['about', 'progress'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className={btn.chip(t === tab)} onClick={() => setTab(t)}>
              {label(t)}
            </button>
          ))}
        </div>
      )}

      {about ? (
        entry ? (
          <ExerciseAbout entry={entry} />
        ) : (
          <p className="py-8 text-center text-sm text-neutral-500">No details available (are you offline?)</p>
        )
      ) : (
        <>
      {usedGrips.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button className={btn.chip(grip === 'all')} onClick={() => setGrip('all')}>
            All grips
          </button>
          {usedGrips.map((g) => (
            <button key={g} className={btn.chip(grip === g)} onClick={() => setGrip(g)}>
              {GRIP_NAMES[g]}
            </button>
          ))}
        </div>
      )}

      {/* kg PRs and charts mean nothing for cardio; its sessions list below is the history. */}
      {!exercise.isCardio && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <PrCard title="Heaviest" value={pr.topWeight && `${formatWeight(pr.topWeight.value)} kg`} date={pr.topWeight?.date} />
            <PrCard title="Best e1RM" value={pr.e1rm && `${formatWeight(Math.round(pr.e1rm.value * 10) / 10)} kg`} date={pr.e1rm?.date} />
            <PrCard title="Best volume" value={pr.volume && `${formatWeight(pr.volume.value)} kg`} date={pr.volume?.date} />
          </div>

          <section className={`${card} flex flex-col gap-3 p-3`}>
            <div className="flex gap-1 rounded-xl bg-neutral-800/60 p-1">
              {(Object.keys(METRICS) as Metric[]).map((m) => (
                <button
                  key={m}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${m === metric ? 'bg-neutral-700 text-white' : 'text-neutral-400'}`}
                  onClick={() => setMetric(m)}
                >
                  {METRICS[m]}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
                <Icon name="trending" className="h-8 w-8 text-neutral-700" />
                No sessions in this range yet
              </div>
            ) : (
              <Chart data={shown} metric={metric} />
            )}
            <div className="flex justify-center gap-2">
              {(Object.keys(RANGES) as Range[]).map((r) => (
                <button key={r} className={btn.chip(r === range)} onClick={() => setRange(r)}>
                  {r}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {sessions.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Sessions</SectionTitle>
          {[...sessions].reverse().map((s) => {
            const labels = setLabels(s.sets.map((x) => x.setType));
            return (
              <button
                key={`${s.workoutId}-${s.grip}`}
                className={`${card} ui-card-press flex flex-col gap-2 p-3 text-left`}
                onClick={() => navigate(`/history/${s.workoutId}`)}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-300">{formatDate(s.date)}</span>
                  {s.grip && (
                    <span className="flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                      <Icon name="grip" className="h-3.5 w-3.5" />
                      {GRIP_NAMES[s.grip]}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 text-sm">
                  {s.sets.map((x, i) => (
                    <span key={i} className="rounded-md bg-neutral-800/70 px-2 py-0.5 tabular-nums">
                      <span className={`font-bold ${SET_TYPE_COLOR[x.setType]}`}>{labels[i]}</span>{' '}
                      {formatSet(x, !!exercise.isCardio)}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle>Exercise settings</SectionTitle>
        <div className={`${card} divide-y divide-white/[0.06] overflow-hidden`}>
          <label className="block cursor-pointer">
            <Row icon="camera" iconBg="bg-sky-600 text-white" title={exercise.image ? 'Change photo' : 'Add photo'} chevron />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await setExerciseImage(id, await photoToDataUrl(file));
                e.target.value = '';
              }}
            />
          </label>
          {exercise.image && (
            <Row icon="image" iconBg="ui-row-muted" title="Remove photo" onClick={() => setExerciseImage(id, null)} />
          )}
          {!!exercise.isCustom && !catalogId && id > 0 && (
            <Row icon="swap" iconBg="ui-row-accent" title="Link to library exercise" onClick={() => setLinking(true)} chevron />
          )}
          {!exercise.isCardio && (
            <Row icon="grip" iconBg="bg-violet-600 text-white" title="Grips">
              <GripSetPicker value={exercise.gripSet} onChange={(v) => setGripSet(id, v)} />
            </Row>
          )}
          {exercise.archived ? (
            <Row icon="unarchive" iconBg="ui-row-accent" title="Unarchive exercise" onClick={() => unarchiveExercise(id)} />
          ) : (
            <Row
              icon={exercise.isCustom ? 'delete' : 'archive'}
              iconBg="bg-red-600 text-white"
              title={exercise.isCustom ? 'Remove exercise' : 'Archive exercise'}
              onClick={remove}
            />
          )}
        </div>
      </section>
        </>
      )}
      {linking && (
        <ExercisePicker single libraryOnly title="Link to library exercise" onDone={([other]) => void link(other!)} onClose={() => setLinking(false)} />
      )}
    </div>
  );
}

function PrCard({ title, value, date }: { title: string; value: string | null; date?: string }) {
  return (
    <div className={`${card} p-3`}>
      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <Icon name="trophy" className="h-3.5 w-3.5 text-amber-400" />
        {title}
      </div>
      <div className="mt-1 font-semibold tabular-nums">{value ?? '—'}</div>
      {date && <div className="text-xs text-neutral-500">{shortDate(date)}</div>}
    </div>
  );
}

function Chart({ data, metric }: { data: SessionStats[]; metric: Metric }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b6ed5d" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#b6ed5d" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a342e" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: '#74807a', fontSize: 11 }} stroke="#2a342e" />
        <YAxis domain={['auto', 'auto']} tick={{ fill: '#74807a', fontSize: 11 }} stroke="#2a342e" />
        <Tooltip
          contentStyle={{ background: '#151c19', border: '1px solid #2a342e', borderRadius: 12 }}
          labelFormatter={(d) => shortDate(String(d))}
          formatter={(v) => [`${formatWeight(Math.round(Number(v) * 10) / 10)} kg`, METRICS[metric]]}
        />
        <Area
          type="monotone"
          dataKey={metric}
          stroke="#b6ed5d"
          strokeWidth={2.5}
          fill="url(#fill)"
          dot={{ r: 3, fill: '#b6ed5d' }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
