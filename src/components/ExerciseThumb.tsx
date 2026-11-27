import { useState } from 'react';
import type { MuscleGroup } from '../repositories/exercises';
import MuscleIcon from './MuscleIcon';

/** Exercise picture (catalog start pose or the user's own); falls back to the muscle-group icon. */
export default function ExerciseThumb({
  image,
  muscleGroup,
  size = 44,
}: {
  image: string | null;
  muscleGroup: MuscleGroup;
  size?: number;
}) {
  // Which source failed to load (offline and never seen, say), so another one gets its own try.
  const [failed, setFailed] = useState<string>();
  if (!image || image === failed) return <MuscleIcon group={muscleGroup} size={size} />;
  return (
    <img
      src={image}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-xl bg-white object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(image)}
    />
  );
}
