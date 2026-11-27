import { useState } from 'react';
import { muscleGroupImage } from '../domain/catalog';
import type { MuscleGroup } from '../repositories/exercises';
import Icon from './Icon';

/** The trained muscle group: the catalog's picture of it, or a symbol (full body, cardio, no picture). */
export default function MuscleIcon({ group, size = 44 }: { group: MuscleGroup; size?: number }) {
  const [failed, setFailed] = useState<string>();
  const image = muscleGroupImage(group);
  const shown = image && image !== failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${shown ? 'bg-white' : 'bg-neutral-800 text-neutral-400'}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {shown ? (
        <img src={image} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(image)} />
      ) : (
        <Icon name={group === 'cardio' ? 'fire' : 'dumbbell'} className="h-1/2 w-1/2" />
      )}
    </span>
  );
}
