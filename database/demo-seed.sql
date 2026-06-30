-- Demo seed from sample UHC EOB (2026-04-25 statement)
-- Idempotent: clears prior demo data by eob_reference

DELETE FROM eob_statement WHERE eob_reference = '000001466898276-A-S-N-FS-E';

INSERT INTO eob_statement (
  statement_date, service_period_start, service_period_end,
  member_name, member_id, eob_reference,
  total_provider_billed, total_amount_owed
) VALUES (
  '2026-05-15', '2026-04-25', '2026-04-29',
  'BRENDEN WALKER', '939160712', '000001466898276-A-S-N-FS-E',
  13710.82, 1765.74
);

INSERT INTO claim (eob_statement_id, provider_name, network_status, patient_account_number, claim_number)
SELECT id, 'SAINT MARYS REGIONAL', 'Network', 'H73000039797200', 'FT6096857201'
FROM eob_statement WHERE eob_reference = '000001466898276-A-S-N-FS-E';

INSERT INTO claim_line (
  claim_id, service_description, service_date_start, service_date_end, processing_code,
  provider_billed, amount_saved, plan_allowed, plan_paid, applied_deductible,
  copay, coinsurance, plan_not_cover, amount_owed
)
SELECT c.id, v.description, v.start_date, v.end_date, v.code,
       v.billed, v.saved, v.allowed, v.paid, v.deductible,
       v.copay, v.coinsurance, v.not_cover, v.owed
FROM claim c
JOIN eob_statement e ON e.id = c.eob_statement_id
CROSS JOIN (VALUES
  ('ROOM AND BOARD', '2026-04-25', '2026-04-26', '6A', 2782.00, 2782.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00),
  ('INPATIENT SERVICES', '2026-04-25', '2026-04-26', 'QC', 5008.46, 3355.46, 1653.00, 0.00, 1653.00, 0.00, 0.00, 0.00, 1653.00),
  ('INPATIENT SERVICES', '2026-04-25', '2026-04-26', '6A', 5460.11, 5460.11, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00)
) AS v(description, start_date, end_date, code, billed, saved, allowed, paid, deductible, copay, coinsurance, not_cover, owed)
WHERE e.eob_reference = '000001466898276-A-S-N-FS-E' AND c.claim_number = 'FT6096857201';

INSERT INTO claim (eob_statement_id, provider_name, network_status, patient_account_number, claim_number)
SELECT id, 'W FERRETTO', 'Network', 'S3005974890', 'FT5908674302'
FROM eob_statement WHERE eob_reference = '000001466898276-A-S-N-FS-E';

INSERT INTO claim_line (
  claim_id, service_description, service_date_start, service_date_end, processing_code,
  provider_billed, amount_saved, plan_allowed, plan_paid, applied_deductible,
  copay, coinsurance, plan_not_cover, amount_owed
)
SELECT c.id, v.description, v.start_date, v.end_date, v.code,
       v.billed, v.saved, v.allowed, v.paid, v.deductible,
       v.copay, v.coinsurance, v.not_cover, v.owed
FROM claim c
JOIN eob_statement e ON e.id = c.eob_statement_id
CROSS JOIN (VALUES
  ('MEDICAL SERVICES', '2026-04-29', NULL, 'LY', 0.01, 0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00),
  ('MEDICAL SERVICES', '2026-04-29', NULL, 'LY', 0.01, 0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00),
  ('MEDICAL SERVICES', '2026-04-29', NULL, 'LY', 0.01, 0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00),
  ('MEDICAL SERVICES', '2026-04-29', NULL, 'LY', 0.01, 0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00),
  ('MEDICAL SERVICES', '2026-04-29', NULL, 'LY', 0.01, 0.01, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00)
) AS v(description, start_date, end_date, code, billed, saved, allowed, paid, deductible, copay, coinsurance, not_cover, owed)
WHERE e.eob_reference = '000001466898276-A-S-N-FS-E' AND c.claim_number = 'FT5908674302';

INSERT INTO claim (eob_statement_id, provider_name, network_status, patient_account_number, claim_number)
SELECT id, 'W FERRETTO', 'Network', 'S3005974890', 'FT5908674301'
FROM eob_statement WHERE eob_reference = '000001466898276-A-S-N-FS-E';

INSERT INTO claim_line (
  claim_id, service_description, service_date_start, service_date_end, processing_code,
  provider_billed, amount_saved, plan_allowed, plan_paid, applied_deductible,
  copay, coinsurance, plan_not_cover, amount_owed
)
SELECT c.id, 'OFFICE VISITS', '2026-04-29', NULL, 'K3',
       418.70, 312.59, 106.11, 0.00, 106.11, 0.00, 0.00, 0.00, 106.11
FROM claim c
JOIN eob_statement e ON e.id = c.eob_statement_id
WHERE e.eob_reference = '000001466898276-A-S-N-FS-E' AND c.claim_number = 'FT5908674301';

INSERT INTO claim (eob_statement_id, provider_name, network_status, patient_account_number, claim_number)
SELECT id, 'M ABU SHEIKHA', 'Network', 'S3005974880', 'FT5908674101'
FROM eob_statement WHERE eob_reference = '000001466898276-A-S-N-FS-E';

INSERT INTO claim_line (
  claim_id, service_description, service_date_start, service_date_end, processing_code,
  provider_billed, amount_saved, plan_allowed, plan_paid, applied_deductible,
  copay, coinsurance, plan_not_cover, amount_owed
)
SELECT c.id, 'DIAGNOSTIC SERVICES', '2026-04-29', NULL, 'UG',
       41.50, 34.87, 6.63, 0.00, 6.63, 0.00, 0.00, 0.00, 6.63
FROM claim c
JOIN eob_statement e ON e.id = c.eob_statement_id
WHERE e.eob_reference = '000001466898276-A-S-N-FS-E' AND c.claim_number = 'FT5908674101';
