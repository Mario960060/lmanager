/*
  # Create companies and company_members tables

  1. Tables Created:
    - companies: Main company/team table
    - company_members: Members and invitations for each company

  2. Security:
    - RLS enabled on all tables
    - Appropriate policies for each table

  3. Changes to existing tables:
    - Add company_id to profiles
*/

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_plan text NOT NULL DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'pro', 'enterprise')),
  max_users integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create company_members table
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  joined_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT either_user_or_email CHECK (
    (user_id IS NOT NULL AND invited_email IS NULL AND status = 'accepted') OR
    (user_id IS NULL AND invited_email IS NOT NULL AND status = 'pending')
  ),
  UNIQUE(company_id, user_id),
  UNIQUE(company_id, invited_email)
);

-- Add company_id to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Create index on company_id in profiles for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_company_id
ON profiles(company_id);

-- Create indexes on company_members for better performance
CREATE INDEX IF NOT EXISTS idx_company_members_company_id
ON company_members(company_id);

CREATE INDEX IF NOT EXISTS idx_company_members_user_id
ON company_members(user_id);

CREATE INDEX IF NOT EXISTS idx_company_members_email
ON company_members(invited_email);

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for companies
-- Users can view their own company
CREATE POLICY "Users can view their company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Admin can update their company
CREATE POLICY "Admins can update their company"
  ON companies FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM company_members WHERE company_id = id AND user_id = auth.uid()) = 'Admin'
  )
  WITH CHECK (
    id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM company_members WHERE company_id = id AND user_id = auth.uid()) = 'Admin'
  );

-- Authenticated users can create a new company
CREATE POLICY "Authenticated users can create companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for company_members
-- Users can view members of their company
CREATE POLICY "Users can view members of their company"
  ON company_members FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Admin can invite members
CREATE POLICY "Admins can invite members"
  ON company_members FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin can remove members
CREATE POLICY "Admins can remove members"
  ON company_members FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- User can accept their invitation
CREATE POLICY "Users can accept their invitation"
  ON company_members FOR UPDATE
  TO authenticated
  USING (
    invited_email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    invited_email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND status = 'accepted'
    AND user_id = auth.uid()
  );
