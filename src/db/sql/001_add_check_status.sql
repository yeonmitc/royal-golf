-- Add check_status and check_updated_at columns to inventories table if they don't exist

ALTER TABLE inventories 
ADD COLUMN IF NOT EXISTS check_status text DEFAULT 'unchecked';

ALTER TABLE inventories 
ADD COLUMN IF NOT EXISTS check_updated_at timestamptz DEFAULT now();

-- Optional: Create an index if needed
-- CREATE INDEX IF NOT EXISTS idx_inventories_check_status ON inventories(check_status);
