-- OncoBoard MDT — Hostinger Business Plan MySQL 8 / MariaDB Schema
-- Import directly in Hostinger hPanel phpMyAdmin, or allow server.ts to auto-create on boot.

CREATE TABLE IF NOT EXISTS clinicians (
  id VARCHAR(64) PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  specialty VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  institution VARCHAR(160) NOT NULL,
  is_chair TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_cases (
  id VARCHAR(64) PRIMARY KEY,
  mrn VARCHAR(64) NOT NULL UNIQUE,
  patient_initials VARCHAR(16) NOT NULL,
  age INT NOT NULL,
  sex VARCHAR(16) NOT NULL,
  organ_board VARCHAR(48) NOT NULL,
  primary_diagnosis VARCHAR(255) NOT NULL,
  histology VARCHAR(255) NOT NULL,
  tnm_t VARCHAR(16) NOT NULL,
  tnm_n VARCHAR(16) NOT NULL,
  tnm_m VARCHAR(16) NOT NULL,
  stage_group VARCHAR(32) NOT NULL,
  ecog INT NOT NULL,
  urgency VARCHAR(24) NOT NULL,
  status VARCHAR(32) NOT NULL,
  lead_clinician_id VARCHAR(64) NOT NULL,
  clinical_summary TEXT NOT NULL,
  treatment_history_json MEDIUMTEXT NOT NULL,
  labs_json MEDIUMTEXT NOT NULL,
  pathology_json MEDIUMTEXT NOT NULL,
  genomics_json MEDIUMTEXT NOT NULL,
  dicom_preset VARCHAR(48) NOT NULL,
  baseline_sum_mm DOUBLE NOT NULL DEFAULT 0,
  consensus_json MEDIUMTEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_cases_board (organ_board),
  INDEX idx_cases_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS imaging_annotations (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  series_id VARCHAR(64) NOT NULL,
  slice_index INT NOT NULL,
  label VARCHAR(160) NOT NULL,
  lesion_type VARCHAR(32) NOT NULL,
  x1 DOUBLE NOT NULL,
  y1 DOUBLE NOT NULL,
  x2 DOUBLE NOT NULL,
  y2 DOUBLE NOT NULL,
  length_mm DOUBLE NOT NULL,
  mean_hu DOUBLE NULL,
  author_name VARCHAR(160) NOT NULL,
  author_specialty VARCHAR(80) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_annot_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_meetings (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  organ_board VARCHAR(48) NOT NULL,
  scheduled_start VARCHAR(40) NOT NULL,
  duration_minutes INT NOT NULL,
  chair_name VARCHAR(160) NOT NULL,
  room_status VARCHAR(24) NOT NULL,
  agenda_json MEDIUMTEXT NOT NULL,
  active_case_id VARCHAR(64) NULL,
  created_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consensus_votes (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  meeting_id VARCHAR(64) NULL,
  clinician_id VARCHAR(64) NOT NULL,
  clinician_name VARCHAR(160) NOT NULL,
  specialty VARCHAR(80) NOT NULL,
  option_label VARCHAR(160) NOT NULL,
  rationale TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_vote_case_clinician (case_id, clinician_id),
  INDEX idx_votes_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_messages (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(96) NOT NULL,
  case_id VARCHAR(64) NULL,
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(160) NOT NULL,
  sender_specialty VARCHAR(80) NOT NULL,
  tag VARCHAR(48) NOT NULL,
  body TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_msg_room (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  actor_name VARCHAR(160) NOT NULL,
  actor_specialty VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(48) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  detail TEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
