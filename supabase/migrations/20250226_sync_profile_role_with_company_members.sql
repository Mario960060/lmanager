/*
  # Sync Profile Role with Company Members

  Changes:
    - Make role nullable in profiles
    - Add trigger to sync role from company_members to profiles
    - When a user's role in company_members changes, update their profile role
*/

-- Make role nullable in profiles
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
ALTER COLUMN role DROP NOT NULL;

ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IS NULL OR role IN ('user', 'project_manager', 'Team_Leader', 'Admin'));

-- Create function to sync role from company_members to profiles
CREATE OR REPLACE FUNCTION sync_profile_role_from_company_members()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the user's profile with the role from company_members
  UPDATE profiles
  SET role = NEW.role,
      updated_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on company_members INSERT or UPDATE
DROP TRIGGER IF EXISTS on_company_members_role_change ON company_members;

CREATE TRIGGER on_company_members_role_change
AFTER INSERT ON company_members
FOR EACH ROW
EXECUTE FUNCTION sync_profile_role_from_company_members();

-- Create another trigger for UPDATE
CREATE TRIGGER on_company_members_role_update
AFTER UPDATE ON company_members
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION sync_profile_role_from_company_members();

-- Sync existing data: set profile role to the role from company_members for each user
UPDATE profiles p
SET role = cm.role,
    updated_at = NOW()
FROM company_members cm
WHERE p.id = cm.user_id
AND (p.role IS NULL OR p.role != cm.role);
