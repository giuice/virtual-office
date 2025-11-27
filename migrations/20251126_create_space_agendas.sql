-- Migration: Create space_agendas table
-- Story 3.11: Space Detail Hover Panel - AC3 Agenda Phase Display
-- Date: 2025-11-26

-- Create space_agendas table to store meeting agendas for spaces
CREATE TABLE IF NOT EXISTS space_agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Agenda phases
  current_phase INTEGER NOT NULL DEFAULT 1,
  total_phases INTEGER NOT NULL DEFAULT 1,
  phase_name VARCHAR(255) NOT NULL DEFAULT 'Current Phase',
  phase_description TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE, -- When the meeting/agenda started
  
  -- Constraints
  CONSTRAINT valid_phases CHECK (current_phase >= 1 AND current_phase <= total_phases),
  CONSTRAINT valid_total_phases CHECK (total_phases >= 1)
);

-- Index for fast lookups by space
CREATE INDEX IF NOT EXISTS idx_space_agendas_space_id ON space_agendas(space_id);
CREATE INDEX IF NOT EXISTS idx_space_agendas_company_id ON space_agendas(company_id);

-- Only one active agenda per space (latest one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_space_agendas_active ON space_agendas(space_id) 
WHERE started_at IS NOT NULL;

-- Enable RLS
ALTER TABLE space_agendas ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view agendas for spaces in their company
CREATE POLICY "Users can view agendas in their company" ON space_agendas
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM users WHERE supabase_uid = auth.uid()::text
    )
  );

-- Admins can manage agendas
CREATE POLICY "Admins can manage agendas" ON space_agendas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE supabase_uid = auth.uid()::text 
      AND company_id = space_agendas.company_id 
      AND role = 'admin'
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_space_agendas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_space_agendas_updated_at
  BEFORE UPDATE ON space_agendas
  FOR EACH ROW
  EXECUTE FUNCTION update_space_agendas_updated_at();

-- Comment
COMMENT ON TABLE space_agendas IS 'Stores meeting agendas and current phase for spaces (Story 3.11)';
