import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { hashPassword } from './auth';
import type {
  AgendaItem,
  AuditLogEntry,
  CaseMessage,
  Clinician,
  ConsensusPlan,
  ConsensusVote,
  DbSystemInfo,
  ImagingAnnotation,
  MdtMeeting,
  PatientCase,
} from '../src/types';

type SqlParams = (string | number | null)[];

class UnifiedDatabase {
  public engine: 'mysql' | 'sqlite' = 'sqlite';
  public hostLabel = 'Embedded Preview SQLite';
  public databaseLabel = 'oncoboard.sqlite';

  private mysqlPool: mysql.Pool | null = null;
  private sqliteDb: Database.Database | null = null;

  public async init(): Promise<void> {
    const dbHost = process.env.DB_HOST?.trim();
    const dbUser = process.env.DB_USER?.trim();
    const dbName = process.env.DB_NAME?.trim();

    if (dbHost && dbUser && dbName) {
      this.mysqlPool = mysql.createPool({
        host: dbHost,
        port: Number(process.env.DB_PORT || 3306),
        user: dbUser,
        password: process.env.DB_PASSWORD ?? '',
        database: dbName,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      await this.mysqlPool.query('SELECT 1');
      this.engine = 'mysql';
      this.hostLabel = `${dbHost}:${process.env.DB_PORT || 3306}`;
      this.databaseLabel = dbName;
    } else {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'oncoboard.sqlite');
      this.sqliteDb = new Database(dbPath);
      this.sqliteDb.pragma('journal_mode = WAL');
      this.engine = 'sqlite';
      this.hostLabel = 'Local Preview (Set DB_HOST=127.0.0.1 for Hostinger MySQL)';
      this.databaseLabel = 'data/oncoboard.sqlite';
    }

    await this.createSchema();
    await this.seedIfEmpty();
  }

  public async query<T = Record<string, unknown>>(sql: string, params: SqlParams = []): Promise<T[]> {
    if (this.engine === 'mysql' && this.mysqlPool) {
      const [rows] = await this.mysqlPool.execute(sql, params);
      return rows as T[];
    }
    if (!this.sqliteDb) throw new Error('Database not initialized');
    return this.sqliteDb.prepare(sql).all(...params) as T[];
  }

  public async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: SqlParams = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  public async execute(sql: string, params: SqlParams = []): Promise<void> {
    if (this.engine === 'mysql' && this.mysqlPool) {
      await this.mysqlPool.execute(sql, params);
      return;
    }
    if (!this.sqliteDb) throw new Error('Database not initialized');
    this.sqliteDb.prepare(sql).run(...params);
  }

  private async createSchema(): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS clinicians (
        id VARCHAR(64) PRIMARY KEY,
        full_name VARCHAR(160) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        specialty VARCHAR(80) NOT NULL,
        title VARCHAR(160) NOT NULL,
        institution VARCHAR(160) NOT NULL,
        is_chair INTEGER NOT NULL DEFAULT 0,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS patient_cases (
        id VARCHAR(64) PRIMARY KEY,
        mrn VARCHAR(64) NOT NULL UNIQUE,
        patient_initials VARCHAR(16) NOT NULL,
        age INTEGER NOT NULL,
        sex VARCHAR(16) NOT NULL,
        organ_board VARCHAR(48) NOT NULL,
        primary_diagnosis VARCHAR(255) NOT NULL,
        histology VARCHAR(255) NOT NULL,
        tnm_t VARCHAR(16) NOT NULL,
        tnm_n VARCHAR(16) NOT NULL,
        tnm_m VARCHAR(16) NOT NULL,
        stage_group VARCHAR(32) NOT NULL,
        ecog INTEGER NOT NULL,
        urgency VARCHAR(24) NOT NULL,
        status VARCHAR(32) NOT NULL,
        lead_clinician_id VARCHAR(64) NOT NULL,
        clinical_summary TEXT NOT NULL,
        treatment_history_json TEXT NOT NULL,
        labs_json TEXT NOT NULL,
        pathology_json TEXT NOT NULL,
        genomics_json TEXT NOT NULL,
        dicom_preset VARCHAR(48) NOT NULL,
        baseline_sum_mm REAL NOT NULL DEFAULT 0,
        consensus_json TEXT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS imaging_annotations (
        id VARCHAR(64) PRIMARY KEY,
        case_id VARCHAR(64) NOT NULL,
        series_id VARCHAR(64) NOT NULL,
        slice_index INTEGER NOT NULL,
        label VARCHAR(160) NOT NULL,
        lesion_type VARCHAR(32) NOT NULL,
        x1 REAL NOT NULL,
        y1 REAL NOT NULL,
        x2 REAL NOT NULL,
        y2 REAL NOT NULL,
        length_mm REAL NOT NULL,
        mean_hu REAL NULL,
        author_name VARCHAR(160) NOT NULL,
        author_specialty VARCHAR(80) NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS mdt_meetings (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        organ_board VARCHAR(48) NOT NULL,
        scheduled_start VARCHAR(40) NOT NULL,
        duration_minutes INTEGER NOT NULL,
        chair_name VARCHAR(160) NOT NULL,
        room_status VARCHAR(24) NOT NULL,
        agenda_json TEXT NOT NULL,
        active_case_id VARCHAR(64) NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS consensus_votes (
        id VARCHAR(64) PRIMARY KEY,
        case_id VARCHAR(64) NOT NULL,
        meeting_id VARCHAR(64) NULL,
        clinician_id VARCHAR(64) NOT NULL,
        clinician_name VARCHAR(160) NOT NULL,
        specialty VARCHAR(80) NOT NULL,
        option_label VARCHAR(160) NOT NULL,
        rationale TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        UNIQUE (case_id, clinician_id)
      )`,
      `CREATE TABLE IF NOT EXISTS case_messages (
        id VARCHAR(64) PRIMARY KEY,
        room_id VARCHAR(96) NOT NULL,
        case_id VARCHAR(64) NULL,
        sender_id VARCHAR(64) NOT NULL,
        sender_name VARCHAR(160) NOT NULL,
        sender_specialty VARCHAR(80) NOT NULL,
        tag VARCHAR(48) NOT NULL,
        body TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(64) PRIMARY KEY,
        actor_id VARCHAR(64) NOT NULL,
        actor_name VARCHAR(160) NOT NULL,
        actor_specialty VARCHAR(80) NOT NULL,
        action VARCHAR(80) NOT NULL,
        resource_type VARCHAR(48) NOT NULL,
        resource_id VARCHAR(64) NOT NULL,
        detail TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL
      )`,
    ];

    for (const stmt of statements) {
      await this.execute(stmt);
    }

    // Additive migrations only. SQLite and MySQL have no portable IF NOT EXISTS for these, so a
    // "duplicate column / key name" error simply means the migration already ran.
    const migrations = [
      `CREATE TABLE IF NOT EXISTS sessions (
        token_hash VARCHAR(64) PRIMARY KEY,
        clinician_id VARCHAR(64) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        expires_at VARCHAR(40) NOT NULL
      )`,
      'ALTER TABLE patient_cases ADD COLUMN archived_at VARCHAR(40) NULL',
      'ALTER TABLE mdt_meetings ADD COLUMN archived_at VARCHAR(40) NULL',
      'CREATE INDEX idx_annot_case ON imaging_annotations (case_id)',
      'CREATE INDEX idx_msg_room ON case_messages (room_id, created_at)',
      'CREATE INDEX idx_audit_created ON audit_logs (created_at)',
      'CREATE INDEX idx_sessions_expires ON sessions (expires_at)',
      'CREATE INDEX idx_sessions_clinician ON sessions (clinician_id)',
    ];
    for (const stmt of migrations) {
      try {
        await this.execute(stmt);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/duplicate|already exists/i.test(message)) continue;
        // Indexes only speed things up, so a host that refuses them must not stop the app booting.
        if (stmt.startsWith('CREATE INDEX')) {
          console.warn(`[db] Skipped optional index (${stmt.slice(0, 40)}...): ${message}`);
          continue;
        }
        throw err;
      }
    }
  }

  public async close(): Promise<void> {
    await this.mysqlPool?.end();
    this.sqliteDb?.close();
  }

  private async seedIfEmpty(): Promise<void> {
    const existing = await this.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM clinicians');
    if (existing && Number(existing.cnt) > 0) return;

    const now = '2026-11-20T09:00:00.000Z';
    const defaultHash = hashPassword(SEED_DEMO_PASSWORD);

    const cliniciansSeed = [
      {
        id: 'clin-med-01',
        full_name: 'Dr. Elena Rostova, MD',
        email: 'e.rostova@oncoboard.org',
        specialty: 'Medical Oncology',
        title: 'Chair, Thoracic & Precision Oncology',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 1,
      },
      {
        id: 'clin-rad-02',
        full_name: 'Dr. Marcus Vance, MD',
        email: 'm.vance@oncoboard.org',
        specialty: 'Diagnostic Radiology',
        title: 'Chief of Oncologic Body & Neuro Imaging',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 0,
      },
      {
        id: 'clin-surg-03',
        full_name: 'Dr. Priya Nair, MD, FACS',
        email: 'p.nair@oncoboard.org',
        specialty: 'Surgical Oncology',
        title: 'Director of Thoracic & Hepatobiliary Surgery',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 0,
      },
      {
        id: 'clin-radonc-04',
        full_name: 'Dr. David Chen, MD',
        email: 'd.chen@oncoboard.org',
        specialty: 'Radiation Oncology',
        title: 'Attending, Stereotactic & CNS Radiotherapy',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 0,
      },
      {
        id: 'clin-path-05',
        full_name: 'Dr. Sofia Lindholm, MD, PhD',
        email: 's.lindholm@oncoboard.org',
        specialty: 'Molecular Pathology',
        title: 'Director, Clinical Genomics & Hematopathology',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 0,
      },
      {
        id: 'clin-coord-06',
        full_name: 'Hannah Brooks, RN, OCN',
        email: 'h.brooks@oncoboard.org',
        specialty: 'MDT Coordinator',
        title: 'Lead Oncology Nurse Navigator',
        institution: 'Regional Comprehensive Cancer Center',
        is_chair: 0,
      },
    ];

    for (const c of cliniciansSeed) {
      await this.execute(
        `INSERT INTO clinicians (id, full_name, email, password_hash, specialty, title, institution, is_chair, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.full_name, c.email, defaultHash, c.specialty, c.title, c.institution, c.is_chair, now],
      );
    }

    const casesSeed: PatientCase[] = [
      {
        id: 'case-thor-01',
        mrn: 'ONC-2026-4102',
        patientInitials: 'M.R.',
        age: 64,
        sex: 'Female',
        organBoard: 'Thoracic',
        primaryDiagnosis: 'Right Upper Lobe Non-Small Cell Lung Adenocarcinoma',
        histology: 'Invasive Acinar-Predominant Adenocarcinoma (TTF-1+)',
        tnmT: 'T2b',
        tnmN: 'N2',
        tnmM: 'M0',
        stageGroup: 'Stage IIIA',
        ecog: 1,
        urgency: 'Urgent',
        status: 'In Review',
        leadClinicianId: 'clin-med-01',
        clinicalSummary:
          '64-year-old female never-smoker presenting with persistent non-productive cough. Contrast CT demonstrates a 36 mm spiculated right upper lobe mass with single-station FDG-avid 4R mediastinal lymphadenopathy confirmed via EBUS-TBNA. Brain MRI negative for intracranial metastasis. PFTs adequate for lobectomy (FEV1 84%, DLCO 78%). Presented for multidisciplinary resectability and perioperative targeted vs. chemo-immunotherapy sequence decision.',
        treatmentHistory: [
          {
            date: '2026-10-19',
            modality: 'Diagnostic Procedure',
            regimen: 'CT-Guided Core Biopsy + EBUS-TBNA Station 4R',
            outcome: 'Adenocarcinoma confirmed; Station 4R positive, Station 7 negative',
          },
          {
            date: '2026-11-04',
            modality: 'Staging Imaging',
            regimen: 'PET-CT Whole Body & Contrast Brain MRI',
            outcome: 'No distant visceral or CNS metastases; cT2bN2M0',
          },
        ],
        labs: [
          { name: 'CEA', value: '18.4', unit: 'ng/mL', referenceRange: '< 3.0', flag: 'Elevated' },
          { name: 'Hemoglobin', value: '12.8', unit: 'g/dL', referenceRange: '12.0–15.5', flag: 'Normal' },
          { name: 'Creatinine', value: '0.82', unit: 'mg/dL', referenceRange: '0.6–1.1', flag: 'Normal' },
          { name: 'LDH', value: '248', unit: 'U/L', referenceRange: '125–220', flag: 'Elevated' },
        ],
        pathology: {
          specimenId: 'SP-26-88412',
          biopsyDate: '2026-10-19',
          biopsySite: 'Right Upper Lobe + Station 4R Node',
          histology: 'Moderately differentiated invasive adenocarcinoma, acinar pattern',
          grade: 'Grade 2 (Moderately Differentiated)',
          margins: 'Core needle biopsy — surgical margin pending resection',
          ihcMarkers: [
            { marker: 'TTF-1', result: 'Diffuse Strong Positive', interpretation: 'Confirms primary pulmonary origin' },
            { marker: 'Napsin A', result: 'Positive', interpretation: 'Supports lung adenocarcinoma' },
            { marker: 'PD-L1 (22C3)', result: 'TPS 65%', interpretation: 'High expression (note EGFR driver priority)' },
            { marker: 'ALK (D5F3)', result: 'Negative', interpretation: 'No ALK rearrangement' },
          ],
          pathologistNote:
            'High tumor cellularity (65%) suitable for comprehensive DNA/RNA NGS. Actionable EGFR exon 21 L858R detected; caution regarding checkpoint inhibitor monotherapy prior to TKI.',
        },
        genomics: {
          assayName: 'OncoSeq 523 Solid Tumor Panel',
          tmbMutPerMb: 4.2,
          msiStatus: 'MSS',
          pdL1Score: '65% TPS',
          mutations: [
            {
              gene: 'EGFR',
              variant: 'p.Leu858Arg (Exon 21)',
              vafPercent: 38.6,
              tier: 'Tier I-A',
              actionableTherapy: 'Osimertinib (ADAURA / LAURA / NeoADAURA)',
            },
            {
              gene: 'TP53',
              variant: 'p.Arg273His',
              vafPercent: 31.4,
              tier: 'Tier II-C',
              actionableTherapy: 'Prognostic co-mutation; monitor early resistance',
            },
          ],
          trialMatches: [
            {
              nctId: 'NCT04351555',
              title: 'NeoADAURA: Neoadjuvant Osimertinib +/- Chemotherapy in Resectable EGFRm NSCLC',
              phase: 'Phase III',
              eligibilityStatus: 'Eligible',
              biomarkerMatch: 'EGFR Exon 21 L858R, Stage IIIA',
            },
            {
              nctId: 'NCT03521154',
              title: 'LAURA Consolidation Osimertinib Post-Chemoradiation',
              phase: 'Phase III',
              eligibilityStatus: 'Screen Required',
              biomarkerMatch: 'If deemed unresectable Stage III',
            },
          ],
        },
        dicomPreset: 'thoracic_ct',
        baselineSumMm: 46.5,
        consensus: null,
        createdAt: '2026-11-12T10:00:00.000Z',
        updatedAt: '2026-11-19T16:30:00.000Z',
      },
      {
        id: 'case-neuro-02',
        mrn: 'ONC-2026-4118',
        patientInitials: 'D.K.',
        age: 58,
        sex: 'Male',
        organBoard: 'Neuro',
        primaryDiagnosis: 'Right Frontal Glioblastoma, IDH-Wildtype (CNS WHO Grade 4)',
        histology: 'Glioblastoma, IDH-wildtype with microvascular proliferation and palisading necrosis',
        tnmT: 'T4',
        tnmN: 'N0',
        tnmM: 'M0',
        stageGroup: 'WHO Grade 4',
        ecog: 1,
        urgency: 'Urgent',
        status: 'Scheduled',
        leadClinicianId: 'clin-radonc-04',
        clinicalSummary:
          '58-year-old male presenting with new-onset focal left upper extremity motor seizure and subtle executive dysfunction. Post-contrast T1 brain MRI reveals a 39 mm ring-enhancing right frontal mass with central necrosis and surrounding FLAIR vasogenic edema causing 4 mm midline shift. Post-operative Day 2 MRI after awake maximal safe resection shows >95% gross total resection of enhancing component. Reviewed for Stupp protocol chemoradiation + Tumor Treating Fields.',
        treatmentHistory: [
          {
            date: '2026-11-08',
            modality: 'Neurosurgery',
            regimen: '5-ALA Guided Maximal Safe Craniotomy & Resection',
            outcome: 'Gross total resection (>95% enhancing rim removed), intact motor strength',
          },
        ],
        labs: [
          { name: 'Platelets', value: '214', unit: 'K/µL', referenceRange: '150–400', flag: 'Normal' },
          { name: 'ANC', value: '4.6', unit: 'K/µL', referenceRange: '1.8–7.7', flag: 'Normal' },
          { name: 'Sodium', value: '136', unit: 'mmol/L', referenceRange: '136–145', flag: 'Normal' },
          { name: 'ALT', value: '31', unit: 'U/L', referenceRange: '7–56', flag: 'Normal' },
        ],
        pathology: {
          specimenId: 'NP-26-11209',
          biopsyDate: '2026-11-08',
          biopsySite: 'Right Superior Frontal Gyrus',
          histology: 'Diffuse astrocytic glioma with necrosis and microvascular proliferation',
          grade: 'CNS WHO Grade 4',
          margins: 'Infiltrative glial neoplasm — GTR of contrast-enhancing core',
          ihcMarkers: [
            { marker: 'IDH1 R132H', result: 'Negative', interpretation: 'Confirmed IDH-wildtype by sequencing' },
            { marker: 'ATRX', result: 'Retained', interpretation: 'Consistent with primary GBM' },
            { marker: 'MGMT Promoter', result: 'Methylated (42%)', interpretation: 'Predicts strong Temozolomide benefit' },
            { marker: 'Ki-67', result: '34%', interpretation: 'High proliferative index' },
          ],
          pathologistNote:
            'MGMT promoter hypermethylation confirmed via pyrosequencing. Molecular profile meets WHO CNS5 integrated criteria for Glioblastoma, IDH-wildtype.',
        },
        genomics: {
          assayName: 'NeuroOnco NGS 180 + Methylation Classifier',
          tmbMutPerMb: 3.1,
          msiStatus: 'MSS',
          pdL1Score: 'N/A',
          mutations: [
            {
              gene: 'TERT',
              variant: 'Promoter c.-124C>T',
              vafPercent: 44.1,
              tier: 'Tier I-B',
              actionableTherapy: 'Diagnostic marker for IDH-wt GBM',
            },
            {
              gene: 'EGFR',
              variant: 'Amplification (18 copies) + vIII',
              vafPercent: 52.0,
              tier: 'Tier II-C',
              actionableTherapy: 'CAR-T / ADC clinical trial eligibility',
            },
            {
              gene: 'PTEN',
              variant: 'p.Arg130*',
              vafPercent: 41.3,
              tier: 'Tier III',
              actionableTherapy: 'PI3K/mTOR pathway trial candidate',
            },
          ],
          trialMatches: [
            {
              nctId: 'NCT05540275',
              title: 'Stupp Chemoradiation + Adjuvant TTFields with Pembrolizumab in MGMT-Methylated GBM',
              phase: 'Phase II/III',
              eligibilityStatus: 'Eligible',
              biomarkerMatch: 'IDH-wt, MGMT-methylated, GTR',
            },
          ],
        },
        dicomPreset: 'neuro_mri',
        baselineSumMm: 39.2,
        consensus: null,
        createdAt: '2026-11-14T08:15:00.000Z',
        updatedAt: '2026-11-19T14:20:00.000Z',
      },
      {
        id: 'case-breast-03',
        mrn: 'ONC-2026-4134',
        patientInitials: 'S.L.',
        age: 49,
        sex: 'Female',
        organBoard: 'Breast',
        primaryDiagnosis: 'Left Breast HER2-Positive / ER-Positive Invasive Ductal Carcinoma',
        histology: 'Invasive Ductal Carcinoma, Grade 3, HER2 3+, ER 80%, PR 40%',
        tnmT: 'T2',
        tnmN: 'N1',
        tnmM: 'M0',
        stageGroup: 'Stage IIB',
        ecog: 0,
        urgency: 'Priority',
        status: 'Scheduled',
        leadClinicianId: 'clin-surg-03',
        clinicalSummary:
          '49-year-old premenopausal female with palpable left upper-outer quadrant breast mass (31 mm on dynamic breast MRI) and biopsy-proven clipped ipsilateral axillary lymph node. Baseline echocardiogram LVEF 64%. Discussed for neoadjuvant TCHP (Docetaxel, Carboplatin, Trastuzumab, Pertuzumab) vs. upfront surgery and axillary management strategy.',
        treatmentHistory: [
          {
            date: '2026-11-01',
            modality: 'Biopsy & Clip Placement',
            regimen: 'Ultrasound-Guided Core Biopsy Breast + Left Axillary Node',
            outcome: 'IDC Grade 3, HER2 3+, clipped metastatic node confirmed',
          },
        ],
        labs: [
          { name: 'CA 15-3', value: '24.1', unit: 'U/mL', referenceRange: '< 30.0', flag: 'Normal' },
          { name: 'LVEF (Echo)', value: '64', unit: '%', referenceRange: '>= 55', flag: 'Normal' },
          { name: 'ALT / AST', value: '22 / 19', unit: 'U/L', referenceRange: '< 40', flag: 'Normal' },
        ],
        pathology: {
          specimenId: 'BP-26-50192',
          biopsyDate: '2026-11-01',
          biopsySite: 'Left Breast 2 o’clock + Left Axillary Level I Node',
          histology: 'Invasive ductal carcinoma of no special type (NST)',
          grade: 'Nottingham Grade 3',
          margins: 'Core biopsy — pre-systemic therapy',
          ihcMarkers: [
            { marker: 'HER2 (4B5)', result: '3+ (Strong Complete)', interpretation: 'HER2-positive, dual anti-HER2 indicated' },
            { marker: 'ER', result: '80% Strong', interpretation: 'Hormone receptor positive' },
            { marker: 'PR', result: '40% Moderate', interpretation: 'Hormone receptor positive' },
            { marker: 'Ki-67', result: '48%', interpretation: 'High proliferation' },
          ],
          pathologistNote: 'Triple-positive phenotype with high Ki-67. Recommend neoadjuvant HER2-directed regimen to assess pCR and tailor adjuvant T-DM1 if residual disease.',
        },
        genomics: {
          assayName: 'Hereditary BRCA1/2 + Somatic Breast Panel',
          tmbMutPerMb: 5.0,
          msiStatus: 'MSS',
          pdL1Score: 'CPS 4',
          mutations: [
            {
              gene: 'ERBB2',
              variant: 'Copy Number Amplification (11.4x)',
              vafPercent: 61.0,
              tier: 'Tier I-A',
              actionableTherapy: 'Trastuzumab + Pertuzumab / T-DM1 / T-DXd',
            },
            {
              gene: 'PIK3CA',
              variant: 'p.His1047Arg',
              vafPercent: 28.4,
              tier: 'Tier I-B',
              actionableTherapy: 'Relevant in metastatic progression (Inavolisib/Alpelisib)',
            },
          ],
          trialMatches: [
            {
              nctId: 'NCT04266249',
              title: 'CompassHER2-pCR: De-escalated Neoadjuvant THP vs. Standard TCHP',
              phase: 'Phase II',
              eligibilityStatus: 'Eligible',
              biomarkerMatch: 'Stage II-III HER2+ Breast Cancer',
            },
          ],
        },
        dicomPreset: 'breast_mri',
        baselineSumMm: 31.4,
        consensus: null,
        createdAt: '2026-11-15T11:30:00.000Z',
        updatedAt: '2026-11-19T09:45:00.000Z',
      },
      {
        id: 'case-gi-04',
        mrn: 'ONC-2026-4151',
        patientInitials: 'R.V.',
        age: 67,
        sex: 'Male',
        organBoard: 'GI',
        primaryDiagnosis: 'Rectosigmoid Adenocarcinoma w/ Solitary Segment VII Liver Metastasis',
        histology: 'Moderately Differentiated Colorectal Adenocarcinoma, MSS, RAS/BRAF Wild-Type',
        tnmT: 'T3',
        tnmN: 'N1',
        tnmM: 'M1a',
        stageGroup: 'Stage IVA',
        ecog: 1,
        urgency: 'Priority',
        status: 'In Review',
        leadClinicianId: 'clin-surg-03',
        clinicalSummary:
          '67-year-old male completed 4 cycles of conversion FOLFOX + Panitumumab with partial radiographic shrinkage of solitary 34 mm Segment VII hepatic metastasis (down from 48 mm baseline). Primary rectosigmoid tumor non-obstructing. Future liver remnant (FLR) estimated at 44%. Presented for simultaneous vs. staged liver-first surgical resection planning.',
        treatmentHistory: [
          {
            date: '2026-08-22',
            modality: 'Systemic Therapy',
            regimen: 'mFOLFOX6 + Panitumumab (Cycles 1–4)',
            outcome: 'Partial Response (-29% hepatic target diameter); CEA fell 86 -> 11.2 ng/mL',
          },
        ],
        labs: [
          { name: 'CEA', value: '11.2', unit: 'ng/mL', referenceRange: '< 3.0', flag: 'Elevated' },
          { name: 'Total Bilirubin', value: '0.7', unit: 'mg/dL', referenceRange: '0.1–1.2', flag: 'Normal' },
          { name: 'Albumin', value: '4.1', unit: 'g/dL', referenceRange: '3.5–5.0', flag: 'Normal' },
        ],
        pathology: {
          specimenId: 'GI-26-33918',
          biopsyDate: '2026-08-05',
          biopsySite: 'Rectosigmoid Colon Endoscopic Biopsy',
          histology: 'Intestinal-type adenocarcinoma',
          grade: 'Grade 2',
          margins: 'Pre-resection',
          ihcMarkers: [
            { marker: 'MLH1/MSH2/MSH6/PMS2', result: 'All Intact', interpretation: 'Proficient MMR (pMMR / MSS)' },
            { marker: 'HER2', result: '0 (Negative)', interpretation: 'No amplification' },
          ],
          pathologistNote: 'Left-sided primary, RAS/BRAF wild-type confirms strong sensitivity to anti-EGFR therapy.',
        },
        genomics: {
          assayName: 'GI Precision NGS Panel',
          tmbMutPerMb: 6.8,
          msiStatus: 'MSS',
          pdL1Score: 'N/A',
          mutations: [
            {
              gene: 'APC',
              variant: 'p.Arg1450*',
              vafPercent: 46.2,
              tier: 'Tier III',
              actionableTherapy: 'Canonical CRC driver',
            },
            {
              gene: 'KRAS/NRAS/BRAF',
              variant: 'All Wild-Type',
              vafPercent: 0,
              tier: 'Tier I-A',
              actionableTherapy: 'Anti-EGFR (Panitumumab / Cetuximab) sensitive',
            },
          ],
          trialMatches: [
            {
              nctId: 'NCT05174195',
              title: 'ctDNA-Guided Adjuvant Escalation Post-Metastasectomy in Oligometastatic CRC',
              phase: 'Phase II',
              eligibilityStatus: 'Eligible',
              biomarkerMatch: 'Resectable Stage IVA CRC',
            },
          ],
        },
        dicomPreset: 'gi_liver_ct',
        baselineSumMm: 48.0,
        consensus: null,
        createdAt: '2026-11-10T14:00:00.000Z',
        updatedAt: '2026-11-19T11:15:00.000Z',
      },
      {
        id: 'case-heme-05',
        mrn: 'ONC-2026-4169',
        patientInitials: 'A.T.',
        age: 39,
        sex: 'Male',
        organBoard: 'Heme',
        primaryDiagnosis: 'Primary Mediastinal Large B-Cell Lymphoma (PMBCL)',
        histology: 'CD20+ CD23+ CD30(weak)+ Large B-Cell Lymphoma w/ Sclerosis',
        tnmT: 'Bulky 11cm',
        tnmN: 'Mediastinal',
        tnmM: 'M0',
        stageGroup: 'Stage IIBX',
        ecog: 0,
        urgency: 'Routine',
        status: 'Scheduled',
        leadClinicianId: 'clin-med-01',
        clinicalSummary:
          '39-year-old male presenting with mild dyspnea and 11.2 cm anterior mediastinal mass without SVC obstruction. Completed 6 cycles of DA-EPOCH-R with end-of-treatment PET-CT demonstrating Deauville Score 3 residual mediastinal mass (4.1 cm). Presented to confirm omission of consolidative mediastinal radiotherapy per IELSG37 trial data.',
        treatmentHistory: [
          {
            date: '2026-06-15',
            modality: 'Immunochemotherapy',
            regimen: 'DA-EPOCH-R × 6 Cycles',
            outcome: 'Complete Metabolic Response (Deauville 3 on EOT PET-CT)',
          },
        ],
        labs: [
          { name: 'LDH', value: '188', unit: 'U/L', referenceRange: '125–220', flag: 'Normal' },
          { name: 'Beta-2 Microglobulin', value: '1.9', unit: 'mg/L', referenceRange: '1.1–2.4', flag: 'Normal' },
        ],
        pathology: {
          specimenId: 'HP-26-77102',
          biopsyDate: '2026-06-02',
          biopsySite: 'Anterior Mediastinal Core Biopsy',
          histology: 'Sheets of large B-cells compartmentalized by fine alveolar fibrosis',
          grade: 'Aggressive B-Cell Lymphoma',
          margins: 'N/A',
          ihcMarkers: [
            { marker: 'CD20 / PAX5', result: 'Diffuse Strong Positive', interpretation: 'B-cell lineage' },
            { marker: 'CD23 / MAL', result: 'Positive', interpretation: 'Classic PMBCL immunophenotype' },
            { marker: 'CD30', result: 'Patchy Weak Positive', interpretation: 'Expected in PMBCL' },
          ],
          pathologistNote: 'Classic thymic B-cell origin PMBCL; 9p24.1 amplification present.',
        },
        genomics: {
          assayName: 'HemeSeq Lymphoid NGS',
          tmbMutPerMb: 7.4,
          msiStatus: 'MSS',
          pdL1Score: '9p24.1 Amplified',
          mutations: [
            {
              gene: 'PD-L1/PD-L2',
              variant: '9p24.1 Copy Gain',
              vafPercent: 48.0,
              tier: 'Tier I-B',
              actionableTherapy: 'Pembrolizumab / Nivolumab if relapsed/refractory',
            },
          ],
          trialMatches: [],
        },
        dicomPreset: 'heme_pet_ct',
        baselineSumMm: 112.0,
        consensus: null,
        createdAt: '2026-11-16T09:20:00.000Z',
        updatedAt: '2026-11-19T12:00:00.000Z',
      },
      {
        id: 'case-thor-06',
        mrn: 'ONC-2026-4180',
        patientInitials: 'E.C.',
        age: 71,
        sex: 'Male',
        organBoard: 'Thoracic',
        primaryDiagnosis: 'Metastatic Lung Adenocarcinoma — Oligoprogression',
        histology: 'Poorly Differentiated Adenocarcinoma, KRAS G12C Mutated',
        tnmT: 'T3',
        tnmN: 'N1',
        tnmM: 'M1b',
        stageGroup: 'Stage IVA',
        ecog: 1,
        urgency: 'Routine',
        status: 'Consensus Reached',
        leadClinicianId: 'clin-med-01',
        clinicalSummary:
          '71-year-old male on maintenance Pemetrexed + Pembrolizumab with solitary adrenal oligoprogression while thoracic primary remains controlled. Board reached unanimous consensus for ablative SBRT to left adrenal metastasis while continuing systemic immunotherapy.',
        treatmentHistory: [
          {
            date: '2026-04-10',
            modality: 'Systemic Chemo-IO',
            regimen: 'Carboplatin + Pemetrexed + Pembrolizumab -> Maintenance',
            outcome: 'Thoracic partial response; isolated adrenal progression at 7 months',
          },
        ],
        labs: [
          { name: 'Creatinine', value: '1.05', unit: 'mg/dL', referenceRange: '0.7–1.3', flag: 'Normal' },
          { name: 'TSH', value: '2.4', unit: 'mIU/L', referenceRange: '0.4–4.0', flag: 'Normal' },
        ],
        pathology: {
          specimenId: 'SP-26-44108',
          biopsyDate: '2026-03-28',
          biopsySite: 'Right Lung Core Biopsy',
          histology: 'Solid-pattern adenocarcinoma',
          grade: 'Grade 3',
          margins: 'N/A',
          ihcMarkers: [
            { marker: 'PD-L1 (22C3)', result: 'TPS 45%', interpretation: 'Responsive to checkpoint blockade' },
          ],
          pathologistNote: 'KRAS G12C confirmed for future second-line targeted therapy reserve.',
        },
        genomics: {
          assayName: 'OncoSeq 523 Solid Tumor Panel',
          tmbMutPerMb: 12.6,
          msiStatus: 'MSS',
          pdL1Score: '45% TPS',
          mutations: [
            {
              gene: 'KRAS',
              variant: 'p.Gly12Cys (G12C)',
              vafPercent: 29.8,
              tier: 'Tier I-A',
              actionableTherapy: 'Sotorasib / Adagrasib (2L reserve)',
            },
          ],
          trialMatches: [],
        },
        dicomPreset: 'thoracic_ct',
        baselineSumMm: 52.0,
        consensus: {
          primaryRecommendation:
            'Deliver consolidative SBRT (40 Gy in 5 fractions) to isolated left adrenal oligometastasis and continue maintenance Pembrolizumab + Pemetrexed.',
          stagingConfirmed: 'rT3 N1 M1b (Stage IVA Oligoprogressive)',
          clinicalRationale:
            'Thoracic disease remains in durable partial response. Local ablative therapy to solitary adrenal site preserves first-line immunotherapy benefit and defers KRAS G12C inhibitor until systemic progression.',
          clinicalTrialRecommended: 'No trial switch needed; reserve KRAS G12C combination trial for systemic progression.',
          followUpActions: [
            {
              specialty: 'Radiation Oncology',
              task: '4D-CT simulation and SBRT planning (40 Gy / 5 fx) for left adrenal lesion',
              dueWindow: 'Within 7 days',
            },
            {
              specialty: 'Medical Oncology',
              task: 'Continue maintenance Pembrolizumab; repeat restaging CT in 8 weeks',
              dueWindow: 'Next cycle',
            },
          ],
          signedOffBy: 'Dr. Elena Rostova, MD',
          signedOffSpecialty: 'Medical Oncology',
          signedOffAt: '2026-11-18T15:40:00.000Z',
        },
        createdAt: '2026-11-05T10:00:00.000Z',
        updatedAt: '2026-11-18T15:40:00.000Z',
      },
    ];

    for (const c of casesSeed) {
      await this.execute(
        `INSERT INTO patient_cases (
          id, mrn, patient_initials, age, sex, organ_board, primary_diagnosis, histology,
          tnm_t, tnm_n, tnm_m, stage_group, ecog, urgency, status, lead_clinician_id,
          clinical_summary, treatment_history_json, labs_json, pathology_json, genomics_json,
          dicom_preset, baseline_sum_mm, consensus_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          c.mrn,
          c.patientInitials,
          c.age,
          c.sex,
          c.organBoard,
          c.primaryDiagnosis,
          c.histology,
          c.tnmT,
          c.tnmN,
          c.tnmM,
          c.stageGroup,
          c.ecog,
          c.urgency,
          c.status,
          c.leadClinicianId,
          c.clinicalSummary,
          JSON.stringify(c.treatmentHistory),
          JSON.stringify(c.labs),
          JSON.stringify(c.pathology),
          JSON.stringify(c.genomics),
          c.dicomPreset,
          c.baselineSumMm,
          c.consensus ? JSON.stringify(c.consensus) : null,
          c.createdAt,
          c.updatedAt,
        ],
      );
    }

    const annotationsSeed: ImagingAnnotation[] = [
      {
        id: 'annot-01',
        caseId: 'case-thor-01',
        seriesId: 'SER-THOR-CT-01',
        sliceIndex: 11,
        label: 'TL-1: RUL Spiculated Primary Mass',
        lesionType: 'Target (RECIST)',
        x1: 63,
        y1: 116,
        x2: 96,
        y2: 116,
        lengthMm: 36.2,
        meanHu: 64,
        authorName: 'Dr. Marcus Vance, MD',
        authorSpecialty: 'Diagnostic Radiology',
        createdAt: '2026-11-18T11:20:00.000Z',
      },
      {
        id: 'annot-02',
        caseId: 'case-neuro-02',
        seriesId: 'SER-NEURO-MR-01',
        sliceIndex: 12,
        label: 'TL-1: Right Frontal Ring-Enhancing Core',
        lesionType: 'Target (RECIST)',
        x1: 85,
        y1: 107,
        x2: 115,
        y2: 107,
        lengthMm: 38.4,
        meanHu: 540,
        authorName: 'Dr. Marcus Vance, MD',
        authorSpecialty: 'Diagnostic Radiology',
        createdAt: '2026-11-18T14:05:00.000Z',
      },
      {
        id: 'annot-03',
        caseId: 'case-gi-04',
        seriesId: 'SER-GI-CT-01',
        sliceIndex: 11,
        label: 'TL-1: Segment VII Hepatic Metastasis',
        lesionType: 'Target (RECIST)',
        x1: 70,
        y1: 130,
        x2: 101,
        y2: 130,
        lengthMm: 33.8,
        meanHu: 54,
        authorName: 'Dr. Marcus Vance, MD',
        authorSpecialty: 'Diagnostic Radiology',
        createdAt: '2026-11-18T15:10:00.000Z',
      },
    ];

    for (const a of annotationsSeed) {
      await this.execute(
        `INSERT INTO imaging_annotations (
          id, case_id, series_id, slice_index, label, lesion_type,
          x1, y1, x2, y2, length_mm, mean_hu, author_name, author_specialty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          a.caseId,
          a.seriesId,
          a.sliceIndex,
          a.label,
          a.lesionType,
          a.x1,
          a.y1,
          a.x2,
          a.y2,
          a.lengthMm,
          a.meanHu,
          a.authorName,
          a.authorSpecialty,
          a.createdAt,
        ],
      );
    }

    const meetingsSeed: MdtMeeting[] = [
      {
        id: 'mtg-live-01',
        title: 'Weekly Multi-Organ Oncology Tumour Board',
        organBoard: 'Multi-Organ',
        scheduledStart: '2026-11-20T14:00:00.000Z',
        durationMinutes: 90,
        chairName: 'Dr. Elena Rostova, MD',
        roomStatus: 'Live',
        activeCaseId: 'case-thor-01',
        agenda: [
          {
            caseId: 'case-thor-01',
            presenterName: 'Dr. Elena Rostova, MD',
            presenterSpecialty: 'Medical Oncology',
            allocatedMinutes: 15,
            completed: false,
          },
          {
            caseId: 'case-neuro-02',
            presenterName: 'Dr. David Chen, MD',
            presenterSpecialty: 'Radiation Oncology',
            allocatedMinutes: 15,
            completed: false,
          },
          {
            caseId: 'case-gi-04',
            presenterName: 'Dr. Priya Nair, MD, FACS',
            presenterSpecialty: 'Surgical Oncology',
            allocatedMinutes: 15,
            completed: false,
          },
          {
            caseId: 'case-breast-03',
            presenterName: 'Dr. Priya Nair, MD, FACS',
            presenterSpecialty: 'Surgical Oncology',
            allocatedMinutes: 15,
            completed: false,
          },
        ],
        createdAt: '2026-11-17T08:00:00.000Z',
      },
      {
        id: 'mtg-sched-02',
        title: 'Thoracic & Molecular Precision Board',
        organBoard: 'Thoracic',
        scheduledStart: '2026-11-24T13:30:00.000Z',
        durationMinutes: 60,
        chairName: 'Dr. Elena Rostova, MD',
        roomStatus: 'Scheduled',
        activeCaseId: 'case-thor-01',
        agenda: [
          {
            caseId: 'case-thor-01',
            presenterName: 'Dr. Sofia Lindholm, MD, PhD',
            presenterSpecialty: 'Molecular Pathology',
            allocatedMinutes: 20,
            completed: false,
          },
        ],
        createdAt: '2026-11-18T10:00:00.000Z',
      },
      {
        id: 'mtg-sched-03',
        title: 'Hematologic & Lymphoma Case Conference',
        organBoard: 'Heme',
        scheduledStart: '2026-11-26T15:00:00.000Z',
        durationMinutes: 60,
        chairName: 'Dr. Sofia Lindholm, MD, PhD',
        roomStatus: 'Scheduled',
        activeCaseId: 'case-heme-05',
        agenda: [
          {
            caseId: 'case-heme-05',
            presenterName: 'Dr. Elena Rostova, MD',
            presenterSpecialty: 'Medical Oncology',
            allocatedMinutes: 20,
            completed: false,
          },
        ],
        createdAt: '2026-11-18T12:00:00.000Z',
      },
    ];

    for (const m of meetingsSeed) {
      await this.execute(
        `INSERT INTO mdt_meetings (
          id, title, organ_board, scheduled_start, duration_minutes,
          chair_name, room_status, agenda_json, active_case_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.id,
          m.title,
          m.organBoard,
          m.scheduledStart,
          m.durationMinutes,
          m.chairName,
          m.roomStatus,
          JSON.stringify(m.agenda),
          m.activeCaseId,
          m.createdAt,
        ],
      );
    }

    const votesSeed: ConsensusVote[] = [
      {
        id: 'vote-01',
        caseId: 'case-thor-01',
        meetingId: 'mtg-live-01',
        clinicianId: 'clin-surg-03',
        clinicianName: 'Dr. Priya Nair, MD, FACS',
        specialty: 'Surgical Oncology',
        optionLabel: 'Neoadjuvant Osimertinib + Lobectomy (NeoADAURA)',
        rationale: 'Single-station non-bulky 4R N2 is technically resectable; induction TKI maximizes R0 resection without immunotherapy pneumonitis risk.',
        createdAt: '2026-11-20T14:04:00.000Z',
      },
      {
        id: 'vote-02',
        caseId: 'case-thor-01',
        meetingId: 'mtg-live-01',
        clinicianId: 'clin-path-05',
        clinicianName: 'Dr. Sofia Lindholm, MD, PhD',
        specialty: 'Molecular Pathology',
        optionLabel: 'Neoadjuvant Osimertinib + Lobectomy (NeoADAURA)',
        rationale: 'Strong EGFR L858R allele frequency (38.6%); avoid checkpoint inhibitors ahead of Osimertinib to prevent severe hepatotoxicity.',
        createdAt: '2026-11-20T14:05:00.000Z',
      },
      {
        id: 'vote-03',
        caseId: 'case-thor-01',
        meetingId: 'mtg-live-01',
        clinicianId: 'clin-radonc-04',
        clinicianName: 'Dr. David Chen, MD',
        specialty: 'Radiation Oncology',
        optionLabel: 'Definitive Chemoradiation + Consolidation Osimertinib (LAURA)',
        rationale: 'Viable non-surgical backup if restaging shows persistent multi-station mediastinal involvement.',
        createdAt: '2026-11-20T14:06:00.000Z',
      },
    ];

    for (const v of votesSeed) {
      await this.execute(
        `INSERT INTO consensus_votes (
          id, case_id, meeting_id, clinician_id, clinician_name, specialty,
          option_label, rationale, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id,
          v.caseId,
          v.meetingId,
          v.clinicianId,
          v.clinicianName,
          v.specialty,
          v.optionLabel,
          v.rationale,
          v.createdAt,
        ],
      );
    }

    const messagesSeed: CaseMessage[] = [
      {
        id: 'msg-01',
        roomId: 'case:case-thor-01',
        caseId: 'case-thor-01',
        senderId: 'clin-rad-02',
        senderName: 'Dr. Marcus Vance, MD',
        senderSpecialty: 'Diagnostic Radiology',
        tag: 'Radiology Finding',
        body: 'Annotated primary RUL spiculated nodule on Slice 12 (36.2 mm max axial diameter, mean 64 HU). No chest wall invasion or pleural effusion; Station 4R measures 14 mm short-axis.',
        createdAt: '2026-11-19T15:10:00.000Z',
      },
      {
        id: 'msg-02',
        roomId: 'case:case-thor-01',
        caseId: 'case-thor-01',
        senderId: 'clin-path-05',
        senderName: 'Dr. Sofia Lindholm, MD, PhD',
        senderSpecialty: 'Molecular Pathology',
        tag: 'Pathology Update',
        body: 'NGS finalized ahead of board: EGFR Exon 21 L858R (38.6% VAF) + TP53 co-mutation. Flagging high PD-L1 (65%) so the team prioritizes EGFR-TKI over upfront anti-PD-1.',
        createdAt: '2026-11-19T16:05:00.000Z',
      },
      {
        id: 'msg-03',
        roomId: 'meeting:mtg-live-01',
        caseId: 'case-thor-01',
        senderId: 'clin-coord-06',
        senderName: 'Hannah Brooks, RN, OCN',
        senderSpecialty: 'MDT Coordinator',
        tag: 'Action Item',
        body: 'Quorum verified across Medical Oncology, Thoracic Surgery, Radiation Oncology, Radiology, and Molecular Pathology. Ready for final vote ratification on ONC-2026-4102.',
        createdAt: '2026-11-20T14:02:00.000Z',
      },
    ];

    for (const msg of messagesSeed) {
      await this.execute(
        `INSERT INTO case_messages (
          id, room_id, case_id, sender_id, sender_name, sender_specialty, tag, body, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.id,
          msg.roomId,
          msg.caseId,
          msg.senderId,
          msg.senderName,
          msg.senderSpecialty,
          msg.tag,
          msg.body,
          msg.createdAt,
        ],
      );
    }

    const auditsSeed: AuditLogEntry[] = [
      {
        id: 'aud-01',
        actorId: 'clin-rad-02',
        actorName: 'Dr. Marcus Vance, MD',
        actorSpecialty: 'Diagnostic Radiology',
        action: 'ANNOTATION_SAVED',
        resourceType: 'imaging_annotation',
        resourceId: 'annot-01',
        detail: 'Saved RECIST 1.1 target lesion measurement (36.2 mm) on ONC-2026-4102 Slice 12.',
        createdAt: '2026-11-18T11:20:00.000Z',
      },
      {
        id: 'aud-02',
        actorId: 'clin-med-01',
        actorName: 'Dr. Elena Rostova, MD',
        actorSpecialty: 'Medical Oncology',
        action: 'CONSENSUS_SIGNED',
        resourceType: 'patient_case',
        resourceId: 'case-thor-06',
        detail: 'Electronically signed MDT consensus plan (Adrenal SBRT + maintenance IO) for ONC-2026-4180.',
        createdAt: '2026-11-18T15:40:00.000Z',
      },
      {
        id: 'aud-03',
        actorId: 'clin-coord-06',
        actorName: 'Hannah Brooks, RN, OCN',
        actorSpecialty: 'MDT Coordinator',
        action: 'MEETING_STARTED',
        resourceType: 'mdt_meeting',
        resourceId: 'mtg-live-01',
        detail: 'Opened Weekly Multi-Organ Oncology Tumour Board live session room.',
        createdAt: '2026-11-20T14:00:00.000Z',
      },
    ];

    for (const a of auditsSeed) {
      await this.execute(
        `INSERT INTO audit_logs (
          id, actor_id, actor_name, actor_specialty, action, resource_type, resource_id, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          a.actorId,
          a.actorName,
          a.actorSpecialty,
          a.action,
          a.resourceType,
          a.resourceId,
          a.detail,
          a.createdAt,
        ],
      );
    }
  }

  public async getSystemInfo(): Promise<DbSystemInfo> {
    const count = async (table: string): Promise<number> => {
      const row = await this.queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ${table}`);
      return Number(row?.cnt ?? 0);
    };

    return {
      engine: this.engine,
      hostingerReady: true,
      host: this.hostLabel,
      database: this.databaseLabel,
      tableCounts: {
        clinicians: await count('clinicians'),
        cases: await count('patient_cases'),
        meetings: await count('mdt_meetings'),
        annotations: await count('imaging_annotations'),
        messages: await count('case_messages'),
        votes: await count('consensus_votes'),
        auditLogs: await count('audit_logs'),
      },
    };
  }
}

export const db = new UnifiedDatabase();

// Shared by every seeded clinician and public in the repo, so the server refuses it outside demo mode.
export const SEED_DEMO_PASSWORD = 'OncoBoard#2026';

export function mapClinicianRow(row: Record<string, unknown>): Clinician {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    specialty: String(row.specialty) as Clinician['specialty'],
    title: String(row.title),
    institution: String(row.institution),
    isChair: Boolean(row.is_chair),
    createdAt: String(row.created_at),
  };
}

export function mapCaseRow(row: Record<string, unknown>): PatientCase {
  return {
    id: String(row.id),
    mrn: String(row.mrn),
    patientInitials: String(row.patient_initials),
    age: Number(row.age),
    sex: String(row.sex) as PatientCase['sex'],
    organBoard: String(row.organ_board) as PatientCase['organBoard'],
    primaryDiagnosis: String(row.primary_diagnosis),
    histology: String(row.histology),
    tnmT: String(row.tnm_t),
    tnmN: String(row.tnm_n),
    tnmM: String(row.tnm_m),
    stageGroup: String(row.stage_group),
    ecog: Number(row.ecog),
    urgency: String(row.urgency) as PatientCase['urgency'],
    status: String(row.status) as PatientCase['status'],
    leadClinicianId: String(row.lead_clinician_id),
    clinicalSummary: String(row.clinical_summary),
    treatmentHistory: JSON.parse(String(row.treatment_history_json || '[]')),
    labs: JSON.parse(String(row.labs_json || '[]')),
    pathology: JSON.parse(String(row.pathology_json || '{}')),
    genomics: JSON.parse(String(row.genomics_json || '{}')),
    dicomPreset: String(row.dicom_preset) as PatientCase['dicomPreset'],
    baselineSumMm: Number(row.baseline_sum_mm ?? 0),
    consensus: row.consensus_json ? (JSON.parse(String(row.consensus_json)) as ConsensusPlan) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapAnnotationRow(row: Record<string, unknown>): ImagingAnnotation {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    seriesId: String(row.series_id),
    sliceIndex: Number(row.slice_index),
    label: String(row.label),
    lesionType: String(row.lesion_type) as ImagingAnnotation['lesionType'],
    x1: Number(row.x1),
    y1: Number(row.y1),
    x2: Number(row.x2),
    y2: Number(row.y2),
    lengthMm: Number(row.length_mm),
    meanHu: row.mean_hu !== null && row.mean_hu !== undefined ? Number(row.mean_hu) : null,
    authorName: String(row.author_name),
    authorSpecialty: String(row.author_specialty) as ImagingAnnotation['authorSpecialty'],
    createdAt: String(row.created_at),
  };
}

export function mapMeetingRow(row: Record<string, unknown>): MdtMeeting {
  return {
    id: String(row.id),
    title: String(row.title),
    organBoard: String(row.organ_board) as MdtMeeting['organBoard'],
    scheduledStart: String(row.scheduled_start),
    durationMinutes: Number(row.duration_minutes),
    chairName: String(row.chair_name),
    roomStatus: String(row.room_status) as MdtMeeting['roomStatus'],
    agenda: JSON.parse(String(row.agenda_json || '[]')) as AgendaItem[],
    activeCaseId: row.active_case_id ? String(row.active_case_id) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
  };
}

export function mapVoteRow(row: Record<string, unknown>): ConsensusVote {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    meetingId: row.meeting_id ? String(row.meeting_id) : null,
    clinicianId: String(row.clinician_id),
    clinicianName: String(row.clinician_name),
    specialty: String(row.specialty) as ConsensusVote['specialty'],
    optionLabel: String(row.option_label),
    rationale: String(row.rationale),
    createdAt: String(row.created_at),
  };
}

export function mapMessageRow(row: Record<string, unknown>): CaseMessage {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    caseId: row.case_id ? String(row.case_id) : null,
    senderId: String(row.sender_id),
    senderName: String(row.sender_name),
    senderSpecialty: String(row.sender_specialty) as CaseMessage['senderSpecialty'],
    tag: String(row.tag) as CaseMessage['tag'],
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}

export function mapAuditRow(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    actorSpecialty: String(row.actor_specialty) as AuditLogEntry['actorSpecialty'],
    action: String(row.action),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    detail: String(row.detail),
    createdAt: String(row.created_at),
  };
}
