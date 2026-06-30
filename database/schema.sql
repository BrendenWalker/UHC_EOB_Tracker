-- PostgreSQL schema for UHC EOB Tracker

CREATE TABLE IF NOT EXISTS eob_statement (
    id SERIAL PRIMARY KEY,
    statement_date DATE,
    service_period_start DATE,
    service_period_end DATE,
    member_name VARCHAR(120),
    member_id VARCHAR(40),
    eob_reference VARCHAR(80),
    total_provider_billed DECIMAL(12, 2),
    total_amount_owed DECIMAL(12, 2),
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim (
    id SERIAL PRIMARY KEY,
    eob_statement_id INTEGER NOT NULL REFERENCES eob_statement(id) ON DELETE CASCADE,
    provider_name VARCHAR(200) NOT NULL,
    network_status VARCHAR(40),
    patient_account_number VARCHAR(80),
    claim_number VARCHAR(40),
    billed_date DATE,
    paid_date DATE,
    notes TEXT,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claim_eob_statement_id ON claim(eob_statement_id);
CREATE INDEX IF NOT EXISTS idx_claim_billed_date ON claim(billed_date);
CREATE INDEX IF NOT EXISTS idx_claim_paid_date ON claim(paid_date);
CREATE INDEX IF NOT EXISTS idx_claim_claim_number ON claim(claim_number);

CREATE TABLE IF NOT EXISTS claim_line (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
    service_description VARCHAR(200) NOT NULL,
    service_date_start DATE,
    service_date_end DATE,
    processing_code VARCHAR(10),
    processing_code_description TEXT,
    provider_billed DECIMAL(12, 2) DEFAULT 0,
    amount_saved DECIMAL(12, 2) DEFAULT 0,
    plan_allowed DECIMAL(12, 2) DEFAULT 0,
    plan_paid DECIMAL(12, 2) DEFAULT 0,
    applied_deductible DECIMAL(12, 2) DEFAULT 0,
    copay DECIMAL(12, 2) DEFAULT 0,
    coinsurance DECIMAL(12, 2) DEFAULT 0,
    plan_not_cover DECIMAL(12, 2) DEFAULT 0,
    amount_owed DECIMAL(12, 2) DEFAULT 0,
    modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claim_line_claim_id ON claim_line(claim_id);

-- App user privileges (tables are often created by postgres superuser; grant access to the app role)
-- Replace eobtracker if your DB_USER differs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eobtracker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON eob_statement, claim, claim_line TO eobtracker;
    GRANT USAGE, SELECT ON SEQUENCE eob_statement_id_seq, claim_id_seq, claim_line_id_seq TO eobtracker;
  END IF;
END
$$;
