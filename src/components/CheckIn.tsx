import RatingPicker from './RatingPicker';
import { btn } from './ui';
import { FEELING_NAMES, FEELINGS, type Feeling, type Rating } from '../domain/checkIn';

/** Optional "How was it?": a rating, and once chosen, the reasons that influenced it. */
export default function CheckIn({
  rating,
  feelings,
  onChange,
}: {
  rating: Rating | null;
  feelings: Feeling[];
  onChange: (v: { rating: Rating | null; feelings: Feeling[] }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-neutral-400">How was it? (optional)</span>
      <RatingPicker value={rating} onChange={(r) => onChange({ rating: r, feelings: r ? feelings : [] })} />
      {rating && (
        <div className="flex flex-wrap gap-2">
          {FEELINGS.map((f) => (
            <button
              key={f}
              className={btn.chip(feelings.includes(f))}
              onClick={() =>
                onChange({ rating, feelings: feelings.includes(f) ? feelings.filter((x) => x !== f) : [...feelings, f] })
              }
            >
              {FEELING_NAMES[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
