import { useState } from 'react';
import ExerciseThumb from '../../components/ExerciseThumb';
import GripIcon from '../../components/GripIcon';
import Icon from '../../components/Icon';
import Sheet from '../../components/Sheet';
import { btn, input, SectionTitle } from '../../components/ui';
import {
  createExercise,
  EQUIPMENT,
  GRIP_NAMES,
  GRIP_SET_NAMES,
  GRIP_SETS,
  GRIPS,
  label,
  MUSCLE_GROUPS,
  type Equipment,
  type Grip,
  type GripSet,
  type MuscleGroup,
} from '../../repositories/exercises';
import { photoToDataUrl } from './photo';

export default function NewExerciseSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [gripsOn, setGripsOn] = useState(false);
  const [grips, setGrips] = useState<Grip[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');

  const withGrips = gripsOn && muscleGroup !== 'cardio';
  const toggleGrip = (grip: Grip) =>
    // kept in the app's usual order, whatever order they were tapped in
    setGrips((chosen) => GRIPS.filter((g) => (g === grip ? !chosen.includes(g) : chosen.includes(g))));

  const save = async () => {
    try {
      const id = await createExercise({ name, muscleGroup, equipment, image, grips: withGrips ? grips : null });
      onCreated?.(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="New exercise" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-center gap-3">
          <label className="shrink-0" aria-label="Add photo">
            {image ? (
              <ExerciseThumb image={image} muscleGroup={muscleGroup} size={56} />
            ) : (
              <span className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-white/[0.06] text-[10px] text-neutral-400">
                <Icon name="camera" className="h-6 w-6" />
                Photo
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImage(await photoToDataUrl(file));
              }}
            />
          </label>
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <SectionTitle>Muscle group</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_GROUPS.map((m) => (
              <button key={m} className={btn.chip(m === muscleGroup)} onClick={() => setMuscleGroup(m)}>
                {label(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionTitle>Equipment</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((m) => (
              <button key={m} className={btn.chip(m === equipment)} onClick={() => setEquipment(m)}>
                {label(m)}
              </button>
            ))}
          </div>
        </div>
        {muscleGroup !== 'cardio' && (
          <div className="flex flex-col gap-2">
            <SectionTitle>Grips</SectionTitle>
            <div className="flex gap-2">
              {[false, true].map((on) => (
                <button key={String(on)} className={btn.chip(on === gripsOn)} onClick={() => setGripsOn(on)}>
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
            {gripsOn &&
              (Object.keys(GRIP_SETS) as GripSet[]).map((set) => (
                <div key={set} className="flex flex-col gap-1.5">
                  <h3 className="px-1 text-sm text-neutral-400">{GRIP_SET_NAMES[set]}</h3>
                  <div className="flex flex-wrap gap-2">
                    {GRIP_SETS[set].map((g) => (
                      <button
                        key={g}
                        // on the green (chosen) chip the green hand dots would vanish
                        className={`${btn.chip(grips.includes(g))} inline-flex items-center gap-1.5 ${grips.includes(g) ? '[--grip-hand:currentColor]' : ''}`}
                        aria-pressed={grips.includes(g)}
                        onClick={() => toggleGrip(g)}
                      >
                        <GripIcon grip={g} className="h-5 w-5" />
                        {GRIP_NAMES[g]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className={btn.primary} disabled={!name.trim() || (withGrips && !grips.length)} onClick={save}>
          <Icon name="save" />
          Save
        </button>
      </div>
    </Sheet>
  );
}
