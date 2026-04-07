ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS name TEXT;

UPDATE public.challenges
SET name = model_name
WHERE name IS NULL OR name = '';