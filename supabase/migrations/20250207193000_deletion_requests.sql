/*
  # Add Deletion Requests Table

  1. New Tables
    - `deletion_requests`
      - For tracking record deletion requests that require approval
      - Columns:
        - id (uuid, primary key)
        - user_id (uuid, references profiles)
        - record_id (uuid)
        - record_type (text)
        - record_details (jsonb)
        - status (text)
        - created_at (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for users and admins
*/

-- Create deletion_requests table
CREATE TABLE IF NOT EXISTS deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  record_type text NOT NULL,
  record_details jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own deletion requests"
  ON deletion_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deletion requests"
  ON deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all deletion requests"
  ON deletion_requests
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('boss', 'project_manager')
    )
  );

CREATE POLICY "Admins can update deletion requests"
  ON deletion_requests
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('boss', 'project_manager')
    )
  );

-- Add indexes for better performance
CREATE INDEX idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX idx_deletion_requests_record_type ON deletion_requests(record_type);
