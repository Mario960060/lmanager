-- Add 4 predefined compacting tasks
-- These tasks represent compacting work with different compactor types
-- Values are normalized to m²/h for a single layer (warstwy + 1 calculation)

INSERT INTO event_tasks (name, description, unit, estimated_hours) VALUES
  (
    'Compacting with Small Kompactor',
    'Compacting sand or type1 aggregate with small kompactor (60-90 kg). Speed: 55 m²/h. Normalized for layer calculation (layers + 1 passes). For sand: baseline 27.5 m²/h, for type1: 22.9 m²/h',
    'm²',
    0.0364  -- 1 m² at baseline (1/27.5 hours for sand)
  ),
  (
    'Compacting with Medium Kompactor',
    'Compacting sand or type1 aggregate with medium kompactor (90-150 kg). Speed: 90 m²/h. Normalized for layer calculation (layers + 1 passes). For sand: baseline 45 m²/h, for type1: 37.5 m²/h',
    'm²',
    0.0222  -- 1 m² at baseline (1/45 hours for sand)
  ),
  (
    'Compacting with Large Kompactor',
    'Compacting sand or type1 aggregate with large kompactor (180-250 kg). Speed: 130 m²/h. Normalized for layer calculation (layers + 1 passes). For sand: baseline 65 m²/h, for type1: 54.2 m²/h',
    'm²',
    0.0154  -- 1 m² at baseline (1/65 hours for sand)
  ),
  (
    'Compacting with Mały Walec',
    'Compacting sand or type1 aggregate with small roller (600-1000 kg). Speed: 200 m²/h. Normalized for layer calculation (layers + 1 passes). For sand: baseline 100 m²/h, for type1: 83.3 m²/h',
    'm²',
    0.01    -- 1 m² at baseline (1/100 hours for sand)
  )
ON CONFLICT DO NOTHING;
