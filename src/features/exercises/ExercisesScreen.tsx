import { useState } from 'react';
import { useNavigate } from 'react-router';
import Icon from '../../components/Icon';
import { btn, PageHeader } from '../../components/ui';
import ExerciseList from './ExerciseList';
import NewExerciseSheet from './NewExerciseSheet';

export default function ExercisesScreen() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [archived, setArchived] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={archived ? 'Archived' : 'Exercises'}
        action={
          <button className={`${btn.secondary} py-2 text-sm`} onClick={() => setCreating(true)}>
            <Icon name="add" className="h-5 w-5" />
            New
          </button>
        }
      />
      <ExerciseList archived={archived} chevron remember onPick={(e) => navigate(`/exercises/${e.id}`)} />
      <button
        className="inline-flex items-center justify-center gap-2 py-3 text-sm text-neutral-500"
        onClick={() => setArchived(!archived)}
      >
        <Icon name={archived ? 'back' : 'archive'} className="h-4 w-4" />
        {archived ? 'Back to exercises' : 'Show archived exercises'}
      </button>
      {creating && <NewExerciseSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
