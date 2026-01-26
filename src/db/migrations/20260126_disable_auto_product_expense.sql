-- This script disables the automatic expense creation when a product is added.
-- It attempts to drop the trigger responsible for this behavior.

-- 1. Identify the trigger (Run this to see existing triggers if you are unsure)
/*
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'products';
*/

-- 2. Drop the trigger
-- Based on the behavior "AUTO:PRODUCT_PURCHASE", it is likely a trigger on the 'products' table.
-- Common naming conventions are used below. If the trigger has a different name,
-- please replace 'trg_create_expense_on_product_insert' with the actual name found from step 1.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find triggers on 'products' table that might be responsible
    FOR r IN (
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'products'
        AND trigger_name ILIKE '%expense%'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.products';
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
    
    -- Also check inventories table just in case
    FOR r IN (
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'inventories'
        AND trigger_name ILIKE '%expense%'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON public.inventories';
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- If the trigger name does not contain 'expense', you may need to drop it manually.
-- Try: DROP TRIGGER IF EXISTS [trigger_name] ON public.products;
