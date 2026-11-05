-- Which built-in template a workout was started from, and the colour the user picked per template.
ALTER TABLE workout ADD COLUMN template_id text;
ALTER TABLE user_settings ADD COLUMN template_colors jsonb NOT NULL DEFAULT '{}';
