import { useState } from 'react';
import Icon from '../../components/Icon';
import Sheet from '../../components/Sheet';
import { btn } from '../../components/ui';
import type { MuscleGroup } from '../../domain/exercises';
import ExerciseList from './ExerciseList';
import NewExerciseSheet from './NewExerciseSheet';

/** Multi-select picker (or single-select when replacing an exercise). */
export default function ExercisePicker({
  single = false,
  title,
  only,
  onDone,
  onClose,
}: {
  single?: boolean;
  title?: string;
  /** Only offer this muscle group (template slots). */
  only?: MuscleGroup;
  onDone: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const toggle = (id: number) => {
    if (single) return onDone([id]);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <Sheet title={title ?? (single ? 'Replace exercise' : 'Add exercises')} onClose={onClose} full>
      <button className="mb-3 inline-flex items-center gap-1 self-start text-sm font-medium text-green-500" onClick={() => setCreating(true)}>
        <Icon name="add" className="h-5 w-5" />
        New exercise
      </button>
      <ExerciseList only={only} selected={new Set(selected)} onPick={(e) => toggle(e.id)} />
      {!single && (
        <div className="sticky bottom-0 bg-neutral-900 pt-3">
          <button className={`${btn.primary} w-full`} disabled={!selected.length} onClick={() => onDone(selected)}>
            <Icon name="add" />
            Add {selected.length || ''} exercise{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
      {creating && <NewExerciseSheet onClose={() => setCreating(false)} onCreated={(id) => toggle(id)} />}
    </Sheet>
  );
}
