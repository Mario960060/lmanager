-- Add is_active column to profiles table with default value of true
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add deactivated_at column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Update any existing records to have is_active = true
UPDATE profiles SET is_active = TRUE WHERE is_active IS NULL;

-- Add comment to explain the purpose of these fields
COMMENT ON COLUMN profiles.is_active IS 'Indicates if the user account is active or has been soft-deleted';
COMMENT ON COLUMN profiles.deactivated_at IS 'Timestamp when the user was deactivated/soft-deleted';
