-- 1. Ensure 'code' column is unique so UPSERT works
-- Try to add a unique constraint/index on 'code' if it doesn't exist
-- Note: If there are duplicate codes, this might fail. You may need to clean up duplicates first.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventories_code_key'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_inventories_code_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_inventories_code_unique ON inventories(code);
    END IF;
END $$;

-- 2. Convert check_status to TEXT to avoid Enum mismatches
-- This allows 'checked', 'error', 'unchecked' without strict enum constraints
ALTER TABLE inventories 
ALTER COLUMN check_status TYPE text USING check_status::text;

ALTER TABLE inventories 
ALTER COLUMN check_status SET DEFAULT 'unchecked';

-- 3. Ensure check_updated_at is present
ALTER TABLE inventories 
ADD COLUMN IF NOT EXISTS check_updated_at timestamptz DEFAULT now();
