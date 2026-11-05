import { useState } from "react";
import ExerciseThumb from "../../components/ExerciseThumb";
import Icon from "../../components/Icon";
import { btn, card, input, SectionTitle } from "../../components/ui";
import { useDbQuery } from "../../hooks/useDbQuery";
import {
  label,
  listExercises,
  MUSCLE_GROUPS,
  setFavorite,
  type Exercise,
  type MuscleGroup,
} from "../../repositories/exercises";

/**
 * Search + muscle-group filter over the exercise library, with a Favourites section on top.
 * Used by the Exercises tab and the workout picker.
 */
export default function ExerciseList({
  archived = false,
  selected,
  chevron = false,
  only,
  onPick,
}: {
  archived?: boolean;
  selected?: Set<number>;
  chevron?: boolean;
  /** Fixed muscle group (template slots): hides the group chips. */
  only?: MuscleGroup;
  onPick: (e: Exercise) => void;
}) {
  const all = useDbQuery(() => listExercises(archived), [archived]);
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(only ?? null);

  const q = search.trim().toLowerCase();
  const shown = (all ?? []).filter(
    (e) =>
      (!muscle || e.muscleGroup === muscle) &&
      (!q || e.name.toLowerCase().includes(q)),
  );
  const favorites = shown.filter((e) => e.favorite);

  const row = (e: Exercise) => (
    <li key={e.id} className="flex items-center gap-1 pr-2">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left"
        onClick={() => onPick(e)}
      >
        <ExerciseThumb image={e.image} muscleGroup={e.muscleGroup} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{e.name}</span>
          <span className="text-sm text-neutral-400">
            {label(e.muscleGroup)} · {label(e.equipment)}
            {e.isCustom ? " · Custom" : ""}
          </span>
        </span>
        {selected?.has(e.id) && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-neutral-950">
            <Icon name="check" className="h-5 w-5" />
          </span>
        )}
      </button>
      <button
        className={`p-2 ${e.favorite ? "text-amber-400" : "text-neutral-600"}`}
        onClick={() => setFavorite(e.id, !e.favorite)}
        aria-label={e.favorite ? "Remove from favourites" : "Add to favourites"}
      >
        <Icon name={e.favorite ? "star" : "starOutline"} className="h-6 w-6" />
      </button>
      {chevron && (
        <Icon name="chevronRight" className="h-5 w-5 text-neutral-600" />
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-neutral-500"
        />
        <input
          className={`${input} pl-10`}
          placeholder="Search exercises"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
        />
      </div>
      {!only && (
        <div className="no-scrollbar -mx-4 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1">
          <button
            className={btn.chip(muscle === null)}
            onClick={() => setMuscle(null)}
          >
            All
          </button>
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              className={btn.chip(muscle === m)}
              onClick={() => setMuscle(muscle === m ? null : m)}
            >
              {label(m)}
            </button>
          ))}
        </div>
      )}
      {favorites.length > 0 && (
        <>
          <SectionTitle>Favourites</SectionTitle>
          <ul className={`${card} divide-y divide-white/[0.06]`}>
            {favorites.map(row)}
          </ul>
          <SectionTitle>All exercises</SectionTitle>
        </>
      )}
      <ul className={`${card} divide-y divide-white/[0.06]`}>
        {shown.map(row)}
        {all && shown.length === 0 && (
          <li className="py-8 text-center text-neutral-500">
            No exercises found
          </li>
        )}
      </ul>
    </div>
  );
}
