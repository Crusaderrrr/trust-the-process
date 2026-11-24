import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "../../components/Icon";
import { btn, card } from "../../components/ui";
import { addDays, parseLocalDate, today } from "../../domain/dates";
import { RANGES, rangeStart, tonnage, type Range } from "../../domain/progress";
import { formatWeight } from "../../domain/sets";
import { PALETTE, templateColor, TEMPLATES } from "../../domain/templates";
import { useDbQuery } from "../../hooks/useDbQuery";
import {
  getTemplateColors,
  setTemplateColor,
} from "../../repositories/templates";

const shortDate = (d: string) =>
  parseLocalDate(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
/** Week bars are keyed by their Monday; the label spans Monday to Sunday ("26 Oct – 1 Nov"). */
const weekRange = (d: string) =>
  `${shortDate(d)} – ${shortDate(addDays(d, 6))}`;

/** Height + fade transition for a block that comes and goes; content stays mounted so it can animate out. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr] opacity-100" : "-mb-3 grid-rows-[0fr] opacity-0" // -mb-3 cancels the parent's gap
      }`}
    >
      <div className="-mx-3 min-h-0 overflow-hidden px-3">{children}</div>
    </div>
  );
}

/** Total volume (completed working sets, kg × reps) per workout or per week. */
export default function TonnageChart({
  workouts,
}: {
  workouts: {
    id: string;
    title: string;
    date: string;
    volume: number;
    templateId?: string | null;
  }[];
}) {
  const [range, setRange] = useState<Range>("3M");
  const [by, setBy] = useState<"workout" | "week">("week");
  // Templates only matter per workout; a week adds up every kind of workout.
  const [templateId, setTemplateId] = useState<string | null>(null);
  const picked = useDbQuery(getTemplateColors, [], { key: "template-colors" });
  const selected = by === "workout" ? templateId : null;
  const data = tonnage(workouts, by, rangeStart(range, today()), selected);
  // The bar under the finger (tap or drag). Tied to the current view so a stale date can't reappear
  // after switching Week/Workout, the range or the template.
  const view = `${by}|${range}|${selected}`;
  const [active, setActive] = useState<{ view: string; date: string } | null>(
    null,
  );
  const point =
    active?.view === view
      ? data.find((d) => d.date === active.date)
      : undefined;
  const pointTemplate = TEMPLATES.find((t) => t.id === point?.templateId);
  const chartRef = useRef<HTMLDivElement>(null);

  /** The bar under a pointer: the plot area (the grid) is split into one equal band per bar. */
  function pick(e: PointerEvent) {
    const plot = chartRef.current
      ?.querySelector(".recharts-cartesian-grid")
      ?.getBoundingClientRect();
    if (!plot || plot.width === 0 || data.length === 0) return;
    const i = Math.floor(((e.clientX - plot.left) / plot.width) * data.length);
    const d = data[Math.min(data.length - 1, Math.max(0, i))]!;
    setActive((a) =>
      a?.view === view && a.date === d.date ? a : { view, date: d.date },
    );
  }

  return (
    <section className={`${card} flex flex-col gap-3 p-3`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Total tonnage</h2>
        <div className="flex gap-1">
          <button
            className={btn.chip(by === "week")}
            onClick={() => setBy("week")}
          >
            Week
          </button>
          <button
            className={btn.chip(by === "workout")}
            onClick={() => setBy("workout")}
          >
            Workout
          </button>
        </div>
      </div>
      <Collapse open={by === "workout"}>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          <button
            className={btn.chip(templateId === null)}
            onClick={() => setTemplateId(null)}
          >
            All
          </button>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`${btn.chip(templateId === t.id)} inline-flex items-center gap-1.5`}
              onClick={() => setTemplateId(templateId === t.id ? null : t.id)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: templateColor(t.id, picked) }}
              />
              {t.name}
            </button>
          ))}
        </div>
      </Collapse>
      <Collapse open={!!selected}>
        {/* Reads templateId, not `selected`, so the row keeps its content while it fades out. */}
        <div className="flex items-center gap-2 py-1 text-xs text-neutral-400">
          Colour
          {templateId &&
            PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`Use colour ${c}`}
                className={`h-6 w-6 rounded-full ${templateColor(templateId, picked) === c ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900" : ""}`}
                style={{ background: c }}
                onClick={() => setTemplateColor(templateId, c)}
              />
            ))}
        </div>
      </Collapse>
      <div className="relative">
        {data.length === 0 ? (
          <div className="flex h-44 items-center justify-center text-sm text-neutral-500">
            No workouts in this range
          </div>
        ) : (
          // pan-y: a horizontal drag scrubs across the bars, a vertical one still scrolls the page.
          <div
            ref={chartRef}
            className="touch-pan-y select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pick(e);
            }}
            onPointerMove={(e) =>
              e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)
            }
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
              >
                <CartesianGrid stroke="#2a342e" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={by === "week" ? weekRange : shortDate}
                  tick={{ fill: "#74807a", fontSize: 11 }}
                  stroke="#2a342e"
                />
                <YAxis
                  tick={{ fill: "#74807a", fontSize: 11 }}
                  stroke="#2a342e"
                />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {data.map((d) => (
                    <Cell
                      key={d.date}
                      fill={templateColor(d.templateId, picked)}
                      fillOpacity={point && d.date !== point.date ? 0.35 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {point && (
          // Centered over the chart; a tap on it clears the selection.
          <button
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl bg-neutral-900/90 px-4 py-2 shadow-lg ring-1 ring-neutral-700"
            onClick={() => setActive(null)}
            aria-label="Clear selection"
          >
            <span className="flex items-center gap-1.5 text-xs text-neutral-400">
              {pointTemplate && (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: templateColor(pointTemplate.id, picked),
                  }}
                />
              )}
              {by === "week" ? weekRange(point.date) : shortDate(point.date)}
              {pointTemplate && ` · ${pointTemplate.name}`}
            </span>
            <span className="text-white">
              <span className="text-2xl font-semibold tabular-nums">
                {formatWeight(point.volume)}
              </span>{" "}
              <span className="text-sm text-neutral-400">kg</span>
            </span>
          </button>
        )}
      </div>
      {point && by === "workout" && (
        // Scrub to a bar, then open it. A day with two workouts gets one link each.
        <div className="flex flex-col gap-1.5">
          {workouts
            .filter((w) => w.date === point.date)
            .map((w) => (
              <Link
                key={w.id}
                to={`/history/${w.id}`}
                className={`${btn.secondary} justify-between`}
              >
                <span className="min-w-0 truncate">{w.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-green-500">
                  Open
                  <Icon name="chevronRight" className="h-5 w-5" />
                </span>
              </Link>
            ))}
        </div>
      )}
      <div className="flex justify-center gap-2">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button
            key={r}
            className={btn.chip(r === range)}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
    </section>
  );
}
