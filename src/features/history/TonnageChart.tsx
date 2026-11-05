import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
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
  const picked = useDbQuery(getTemplateColors, []);
  const selected = by === "workout" ? templateId : null;
  const data = tonnage(workouts, by, rangeStart(range, today()), selected);

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
      {data.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm text-neutral-500">
          No workouts in this range
        </div>
      ) : (
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
            <YAxis tick={{ fill: "#737373", fontSize: 11 }} stroke="#262626" />
            <Tooltip
              cursor={{ fill: "#ffffff10" }}
              contentStyle={{
                background: "#171717",
                border: "1px solid #262626",
                borderRadius: 12,
              }}
              labelFormatter={(d) =>
                by === "week" ? weekRange(String(d)) : shortDate(String(d))
              }
              formatter={(v, _name, item) => {
                const id = (
                  item.payload as { templateId?: string | null } | undefined
                )?.templateId;
                return [
                  `${formatWeight(Number(v))} kg`,
                  TEMPLATES.find((t) => t.id === id)?.name ?? "Tonnage",
                ];
              }}
            />
            <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={templateColor(d.templateId, picked)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
