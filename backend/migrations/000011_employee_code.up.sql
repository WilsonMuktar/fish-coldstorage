-- Short numeric code for barcode scanning, auto-assigned starting at 1001
ALTER TABLE employees ADD COLUMN IF NOT EXISTS code INTEGER UNIQUE;

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START 1001;

UPDATE employees SET code = nextval('employee_code_seq') WHERE code IS NULL;

ALTER TABLE employees ALTER COLUMN code SET DEFAULT nextval('employee_code_seq');
