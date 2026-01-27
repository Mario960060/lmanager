/*
  # Update Profile Roles

  1. Changes
    - Rename 'boss' role to 'Admin'
    - Add 'Team_Leader' role
    - Update existing profiles
*/

-- Update the role type check
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('user', 'project_manager', 'Team_Leader', 'Admin'));

-- Update existing boss roles to Admin
UPDATE profiles
SET role = 'Admin'
WHERE role = 'boss';
