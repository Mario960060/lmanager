-- Add speed_m_per_hour column to setup_digging table
ALTER TABLE public.setup_digging 
ADD COLUMN IF NOT EXISTS speed_m_per_hour INTEGER DEFAULT NULL;

-- Update existing carriers with default speeds based on size
UPDATE public.setup_digging 
SET speed_m_per_hour = CASE 
  WHEN "size (in tones)" = 0.1 THEN 3000
  WHEN "size (in tones)" = 0.125 THEN 2750
  WHEN "size (in tones)" = 0.15 THEN 2500
  WHEN "size (in tones)" = 0.3 THEN 1500
  WHEN "size (in tones)" = 0.5 THEN 1500
  WHEN "size (in tones)" = 1 THEN 4000
  WHEN "size (in tones)" = 3 THEN 6000
  WHEN "size (in tones)" = 5 THEN 7000
  WHEN "size (in tones)" = 10 THEN 8000
  ELSE 4000
END
WHERE type = 'barrows_dumpers' AND speed_m_per_hour IS NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.setup_digging.speed_m_per_hour IS 'Speed in meters per hour for carriers (barrows/dumpers). Used for calculating transport time dynamically.';
