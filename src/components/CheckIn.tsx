import RatingPicker from './RatingPicker';
import type { Feeling, Rating } from '../domain/checkIn';

/** Optional "How was it?": a rating. Feelings are no longer offered; ones already saved are kept. */
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
    </div>
  );
}
