-- Create the set_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create calendar_equipment table
CREATE TABLE IF NOT EXISTS public.calendar_equipment (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    notes TEXT,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS policies
ALTER TABLE public.calendar_equipment ENABLE ROW LEVEL SECURITY;

-- Policies for calendar_equipment
CREATE POLICY "Enable read access for authenticated users" 
ON public.calendar_equipment 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow all authenticated users to create calendar equipment requests" 
ON public.calendar_equipment 
FOR INSERT 
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
);

CREATE POLICY "Allow users to update their own requests and admins/managers to update any" 
ON public.calendar_equipment 
FOR UPDATE 
TO authenticated
USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('Admin', 'project_manager')
    )
);

CREATE POLICY "Allow users to delete their own requests and admins/managers to delete any" 
ON public.calendar_equipment 
FOR DELETE 
TO authenticated
USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('Admin', 'project_manager')
    )
);

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.calendar_equipment
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
