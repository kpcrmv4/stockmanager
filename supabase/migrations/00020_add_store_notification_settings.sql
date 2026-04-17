-- Migration: 00020_add_store_notification_settings.sql
-- Description: Add notification settings array to stores table for customizable role-based routing

-- Default: notify everyone (owner, manager, bar, staff) to maintain backward compatibility temporarily,
-- but the recommended default in the UI will usually just be owner and manager.
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS borrow_notification_roles text[] DEFAULT ARRAY['owner', 'manager']::text[];

-- Update existing stores to include owner and manager if it's null somehow
UPDATE stores
SET borrow_notification_roles = ARRAY['owner', 'manager']::text[]
WHERE borrow_notification_roles IS NULL;
