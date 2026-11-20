-- Triceps cable work with one hand gets its own grip.
ALTER TABLE workout_exercise DROP CONSTRAINT workout_exercise_grip_check;
ALTER TABLE workout_exercise ADD CONSTRAINT workout_exercise_grip_check CHECK (grip IN
  ('wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal', 'rope', 'v_bar', 'straight_bar', 'single_hand'));
