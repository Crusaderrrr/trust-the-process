import { useNavigate } from 'react-router';
import ExerciseThumb from '../../components/ExerciseThumb';
import Icon from '../../components/Icon';
import { card, SectionTitle } from '../../components/ui';
import { catalogImage, equipmentInfo, muscleInfo, type CatalogEntry } from '../../domain/catalog';
import { useDbQuery } from '../../hooks/useDbQuery';
import { listExercises } from '../../repositories/exercises';

/** Start / peak pictures; entries with a single pose show just that one. */
export function ExercisePoses({ entry }: { entry: CatalogEntry }) {
  const { start, peak, main } = entry.images;
  const poses = [
    ['Start', start],
    ['Peak', peak],
    ['', main],
  ].filter((p): p is [string, string] => !!p[1]);
  return (
    <div className="flex justify-center gap-2">
      {poses.map(([caption, name]) => (
        <figure key={name} className="w-1/2">
          <img src={catalogImage(name)} alt={`${entry.name} ${caption}`.trim()} className="aspect-square w-full rounded-2xl bg-white object-contain" />
          {caption && <figcaption className="pt-1 text-center text-xs text-neutral-500">{caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function Chip({ image, name, detail }: { image: string | null; name: string; detail?: string }) {
  return (
    <li className={`${card} flex items-center gap-2 py-1.5 pr-3 pl-1.5`}>
      {image && <img src={image} alt="" loading="lazy" className="h-9 w-9 rounded-full bg-white object-contain" />}
      <span className={image ? '' : 'pl-2'}>
        <span className="block text-sm font-medium">{name}</span>
        {detail && <span className="block text-xs text-neutral-500">{detail}</span>}
      </span>
    </li>
  );
}

function Muscles({ title, ids }: { title: string; ids: string[] }) {
  if (!ids.length) return null;
  return (
    <>
      <h3 className="px-1 text-sm text-neutral-400">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const m = muscleInfo(id);
          return <Chip key={id} image={m.image} name={m.name} detail={m.latin} />;
        })}
      </ul>
    </>
  );
}

/** Description, muscles, equipment, instructions, tips and similar exercises. */
export default function ExerciseAbout({ entry }: { entry: CatalogEntry }) {
  const navigate = useNavigate();
  const library = useDbQuery(() => listExercises(), [], { key: 'exercises' });
  const related = entry.related.flatMap((id) => library?.find((e) => e.catalogId === id) ?? []);
  const equipment = entry.equipment ? equipmentInfo(entry.equipment) : null;

  return (
    <>
      <p className="px-1 text-neutral-300">{entry.description}</p>

      <section className="flex flex-col gap-2">
        <SectionTitle>Target muscles</SectionTitle>
        <Muscles title="Primary" ids={entry.primaryMuscles} />
        <Muscles title="Secondary" ids={entry.secondaryMuscles} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Equipment</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          <Chip image={equipment?.image ?? null} name={equipment?.name ?? 'Bodyweight'} />
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>How to do it</SectionTitle>
        <ol className={`${card} flex list-decimal flex-col gap-2 py-3 pr-3 pl-8 text-sm`}>
          {entry.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      {entry.tips.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Form tips</SectionTitle>
          <ul className={`${card} flex list-disc flex-col gap-2 py-3 pr-3 pl-8 text-sm`}>
            {entry.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Related exercises</SectionTitle>
          <ul className={`${card} divide-y divide-white/[0.06]`}>
            {related.map((e) => (
              <li key={e.id}>
                <button className="flex w-full items-center gap-3 px-3 py-2 text-left" onClick={() => navigate(`/exercises/${e.id}`)}>
                  <ExerciseThumb image={e.image} muscleGroup={e.muscleGroup} size={40} />
                  <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                  <Icon name="chevronRight" className="h-5 w-5 text-neutral-600" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
