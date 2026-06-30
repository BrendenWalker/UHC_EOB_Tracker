-- Optional: run after removing duplicate rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_eob_statement_eob_reference_unique
  ON eob_statement (eob_reference)
  WHERE eob_reference IS NOT NULL AND TRIM(eob_reference) <> '';
