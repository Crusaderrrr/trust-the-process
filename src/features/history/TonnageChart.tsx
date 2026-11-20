import { useRef, useState, type PointerEvent } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
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

/** Total volume (completed working sets, kg × reps) per workout or per week. */
export default function TonnageChart({
  workouts,
}: {
  workouts: { date: string; volume: number; templateId?: string | null }[];
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
      {by === "workout" && (
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
      )}
      {selected && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          Colour
          {PALETTE.map((c) => (
            <button
              key={c}
              aria-label={`Use colour ${c}`}
              className={`h-6 w-6 rounded-full ${templateColor(selected, picked) === c ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900" : ""}`}
              style={{ background: c }}
              onClick={() => setTemplateColor(selected, c)}
            />
          ))}
        </div>
      )}
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
                <CartesianGrid stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={by === "week" ? weekRange : shortDate}
                  tick={{ fill: "#737373", fontSize: 11 }}
                  stroke="#262626"
                />
                <YAxis
                  tick={{ fill: "#737373", fontSize: 11 }}
                  stroke="#262626"
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
