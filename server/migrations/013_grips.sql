-- An exercise lists the grips it offers (any of them), instead of naming one of two fixed sets.
ALTER TABLE exercise ADD COLUMN grips text[] CHECK (grips <@ ARRAY[
  'wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal', 'rope', 'v_bar', 'straight_bar', 'single_hand']);
UPDATE exercise SET grips = ARRAY['wide', 'normal', 'narrow', 'parallel_wide', 'parallel_normal'] WHERE grip_set = 'back';
UPDATE exercise SET grips = ARRAY['rope', 'v_bar', 'straight_bar', 'single_hand'] WHERE grip_set = 'triceps';
ALTER TABLE exercise DROP COLUMN grip_set;
