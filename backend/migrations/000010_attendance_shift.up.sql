-- Add shift column to attendance (1=pagi, 2=sore), default existing rows to shift 1
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS shift SMALLINT NOT NULL DEFAULT 1;

-- Drop old unique constraint and add new one including shift
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_attend_date_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_employee_id_attend_date_shift_key'
  ) THEN
    ALTER TABLE attendance ADD CONSTRAINT attendance_employee_id_attend_date_shift_key UNIQUE (employee_id, attend_date, shift);
  END IF;
END $$;
