-- Create setup_digging table for excavators, dumpers, and barrows
CREATE TABLE IF NOT EXISTS public.setup_digging (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'free_to_use' CHECK (status IN ('free_to_use', 'in_use', 'broken')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL CHECK (type IN ('excavator', 'dumper', 'barrow')),
    quantity INTEGER NOT NULL DEFAULT 1,
    in_use_quantity INTEGER NOT NULL DEFAULT 0,
    size_tonnes NUMERIC -- This might be missing in your table
);

-- Add RLS policies for setup_digging table
ALTER TABLE public.setup_digging ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to select from setup_digging
CREATE POLICY "Authenticated users can view setup_digging"
ON public.setup_digging
FOR SELECT
TO authenticated
USING (true);

-- Policy to allow authenticated users with admin role to insert, update, delete from setup_digging
CREATE POLICY "Admin users can manage setup_digging"
ON public.setup_digging
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to setup_digging table
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.setup_digging
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Grant permissions to authenticated users
GRANT SELECT ON public.setup_digging TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.setup_digging TO authenticated;
