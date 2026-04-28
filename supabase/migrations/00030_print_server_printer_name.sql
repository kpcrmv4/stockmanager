-- Print server can now poll the printer name + working hours from
-- store_settings on every heartbeat instead of forcing the operator
-- to redownload config.json after a name/time change. Working hours
-- are already in print_server_working_hours (jsonb); add the printer
-- name alongside it. Nullable — when null the print server keeps
-- using whatever PRINTER_NAME the original config.json shipped with.
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS print_server_printer_name TEXT;
