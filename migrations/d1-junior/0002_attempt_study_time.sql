-- Additive only. Apply to a disposable local/pilot DB first; remote changes
-- require the owner's approval. Legacy rows retain their received_at_ms date.
ALTER TABLE junior_attempts ADD COLUMN occurred_at_ms INTEGER;
CREATE INDEX idx_junior_attempts_study_time
ON junior_attempts(student_id, COALESCE(occurred_at_ms, received_at_ms), event_id);
