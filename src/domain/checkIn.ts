// Optional mood marks: a rating after a workout (with what influenced it).

export const RATINGS = ['good', 'okay', 'bad'] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_NAMES: Record<Rating, string> = { good: 'Good', okay: 'Okay', bad: 'Bad' };
/** Work on dark and light backgrounds. */
export const RATING_COLOR: Record<Rating, string> = { good: '#22C55E', okay: '#F59E0B', bad: '#EF4444' };

export const FEELINGS = [
  'poor_sleep',
  'slept_well',
  'ate_badly',
  'ate_well',
  'bad_mood',
  'good_mood',
  'stressed',
  'low_energy',
  'felt_strong',
] as const;
export type Feeling = (typeof FEELINGS)[number];
export const FEELING_NAMES: Record<Feeling, string> = {
  poor_sleep: 'Poor sleep',
  slept_well: 'Slept well',
  ate_badly: 'Ate badly',
  ate_well: 'Ate well',
  bad_mood: 'Bad mood',
  good_mood: 'Good mood',
  stressed: 'Stressed',
  low_energy: 'Low energy',
  felt_strong: 'Felt strong',
};
