-- Migration: 20251125_neighborhoods_table.sql
-- Story 3.9: Space Grouping and Neighborhoods
-- Created: 2025-11-25
--
-- This migration creates the neighborhoods table and adds neighborhood_id to spaces.

-- 1. Create neighborhoods table
CREATE TABLE IF NOT EXISTS neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '--vo-neighborhood-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

-- 2. Add neighborhood_id column to spaces table
ALTER TABLE spaces
ADD COLUMN IF NOT EXISTS neighborhood_id UUID REFERENCES neighborhoods(id) ON DELETE SET NULL;

-- 3. Create index for faster neighborhood lookups
CREATE INDEX IF NOT EXISTS idx_spaces_neighborhood_id ON spaces(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_neighborhoods_company_id ON neighborhoods(company_id);

-- 4. Create updated_at trigger for neighborhoods
CREATE OR REPLACE FUNCTION update_neighborhoods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_neighborhoods_updated_at ON neighborhoods;
CREATE TRIGGER set_neighborhoods_updated_at
  BEFORE UPDATE ON neighborhoods
  FOR EACH ROW
  EXECUTE FUNCTION update_neighborhoods_updated_at();

-- 5. RLS Policies for neighborhoods table
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

-- Policy: Company members can read their company's neighborhoods
-- Note: Uses 'users' table with supabase_uid (TEXT) column for auth mapping
-- auth.uid() returns UUID, so we cast to text for comparison
DROP POLICY IF EXISTS "Company members can read neighborhoods" ON neighborhoods;
CREATE POLICY "Company members can read neighborhoods"
  ON neighborhoods FOR SELECT
  USING (
    neighborhoods.company_id IN (
      SELECT company_id FROM users WHERE supabase_uid = auth.uid()::text
    )
  );

-- Policy: Company admins can insert neighborhoods
DROP POLICY IF EXISTS "Company admins can create neighborhoods" ON neighborhoods;
CREATE POLICY "Company admins can create neighborhoods"
  ON neighborhoods FOR INSERT
  WITH CHECK (
    neighborhoods.company_id IN (
      SELECT company_id FROM users 
      WHERE supabase_uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Policy: Company admins can update neighborhoods
DROP POLICY IF EXISTS "Company admins can update neighborhoods" ON neighborhoods;
CREATE POLICY "Company admins can update neighborhoods"
  ON neighborhoods FOR UPDATE
  USING (
    neighborhoods.company_id IN (
      SELECT company_id FROM users 
      WHERE supabase_uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Policy: Company admins can delete neighborhoods
DROP POLICY IF EXISTS "Company admins can delete neighborhoods" ON neighborhoods;
CREATE POLICY "Company admins can delete neighborhoods"
  ON neighborhoods FOR DELETE
  USING (
    neighborhoods.company_id IN (
      SELECT company_id FROM users 
      WHERE supabase_uid = auth.uid()::text AND role = 'admin'
    )
  );

-- 6. Grant permissions (adjust as needed for your Supabase setup)
-- GRANT SELECT ON neighborhoods TO authenticated;
-- GRANT INSERT, UPDATE, DELETE ON neighborhoods TO authenticated;

COMMENT ON TABLE neighborhoods IS 'Neighborhoods group spaces into logical sections (e.g., Engineering, Marketing) - Story 3.9';
COMMENT ON COLUMN neighborhoods.color IS 'CSS variable name like --vo-neighborhood-1';
COMMENT ON COLUMN spaces.neighborhood_id IS 'Optional link to a neighborhood for grouping in floor plan UI';
