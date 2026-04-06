-- Add 'transfer' to print_job_type enum for transfer receipt printing
ALTER TYPE print_job_type ADD VALUE IF NOT EXISTS 'transfer';
