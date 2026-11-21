import { GoogleGenAI, Type } from '@google/genai';
import type {
  AiDicomImpressionResult,
  AiMinutesResult,
  AiSynthesisResult,
  CaseMessage,
  ConsensusVote,
  ImagingAnnotation,
  PatientCase,
} from '../src/types';

const CLINICAL_MODEL = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets or Hostinger Environment Variables to activate AI diagnostic assistance.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildCasePromptContext(
  patientCase: PatientCase,
  annotations: ImagingAnnotation[],
): string {
  return [
    `Patient: ${patientCase.patientInitials} (${patientCase.age}y ${patientCase.sex}) | MRN: ${patientCase.mrn}`,
    `Organ Board: ${patientCase.organBoard} Oncology`,
    `Diagnosis: ${patientCase.primaryDiagnosis}`,
    `Histology: ${patientCase.histology}`,
    `AJCC Staging: ${patientCase.tnmT} ${patientCase.tnmN} ${patientCase.tnmM} (${patientCase.stageGroup}) | ECOG: ${patientCase.ecog}`,
    `Clinical Summary: ${patientCase.clinicalSummary}`,
    `Treatment History: ${JSON.stringify(patientCase.treatmentHistory)}`,
    `Labs: ${JSON.stringify(patientCase.labs)}`,
    `Pathology IHC: ${JSON.stringify(patientCase.pathology.ihcMarkers)}`,
    `Pathology Note: ${patientCase.pathology.pathologistNote}`,
    `Molecular Genomics: Assay=${patientCase.genomics.assayName}, TMB=${patientCase.genomics.tmbMutPerMb}, MSI=${patientCase.genomics.msiStatus}, PD-L1=${patientCase.genomics.pdL1Score}`,
    `Mutations: ${JSON.stringify(patientCase.genomics.mutations)}`,
    `RECIST Imaging Annotations: ${JSON.stringify(
      annotations.map((a) => ({
        label: a.label,
        type: a.lesionType,
        slice: a.sliceIndex + 1,
        lengthMm: a.lengthMm,
        meanHu: a.meanHu,
      })),
    )}`,
  ].join('\n');
}

export async function synthesizeCaseClinicalSupport(
  patientCase: PatientCase,
  annotations: ImagingAnnotation[],
): Promise<AiSynthesisResult> {
  const ai = getAiClient();
  const context = buildCasePromptContext(patientCase, annotations);

  const response = await ai.models.generateContent({
    model: CLINICAL_MODEL,
    contents: `Analyze this oncology tumour board case and generate structured multidisciplinary clinical decision support aligned with NCCN/ESMO guidelines:\n\n${context}`,
    config: {
      systemInstruction:
        'You are an academic oncology clinical decision-support assistant for a Multi-Disciplinary Tumour Board. Provide concise, evidence-based, guideline-concordant synthesis tailored to attending oncologists, radiologists, surgeons, and pathologists. Always include an explicit clinical decision-support disclaimer.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          stagingVerification: {
            type: Type.STRING,
            description: 'Verification and nuance of TNM staging and resectability/operability.',
          },
          guidelineConcordance: {
            type: Type.STRING,
            description: 'Summary of primary NCCN/ESMO guideline considerations.',
          },
          recommendedPathways: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                rank: { type: Type.INTEGER },
                pathway: { type: Type.STRING },
                evidenceLevel: { type: Type.STRING },
                rationale: { type: Type.STRING },
              },
            },
          },
          biomarkerInsights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          diagnosticGaps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          clinicalTrialConsiderations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          disclaimer: { type: Type.STRING },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as AiSynthesisResult;
  return parsed;
}

export async function analyzeDicomSliceSnapshot(
  patientCase: PatientCase,
  snapshotBase64: string,
  sliceMeta: {
    modality: string;
    sliceIndex: number;
    totalSlices: number;
    windowCenter: number;
    windowWidth: number;
    seriesDescription: string;
  },
): Promise<AiDicomImpressionResult> {
  const ai = getAiClient();
  const cleanBase64 = snapshotBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await ai.models.generateContent({
    model: CLINICAL_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: cleanBase64,
          },
        },
        {
          text: `Provide structured radiological decision-support observations for this ${sliceMeta.modality} slice (Slice ${sliceMeta.sliceIndex + 1}/${sliceMeta.totalSlices}, W/L ${sliceMeta.windowWidth}/${sliceMeta.windowCenter}, Series: ${sliceMeta.seriesDescription}) in the context of ${patientCase.primaryDiagnosis} (${patientCase.stageGroup}, ${patientCase.organBoard} board). Summary: ${patientCase.clinicalSummary}`,
        },
      ],
    },
    config: {
      systemInstruction:
        'You are a radiology decision-support assistant supporting a diagnostic radiologist during a tumour board. Describe visible morphology, density/enhancement characteristics, and follow-up imaging recommendations cautiously and concisely. Never claim definitive clinical diagnosis; state clearly that attending radiologist verification is required.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          anatomicalRegion: { type: Type.STRING },
          keyObservations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          lesionCharacterization: { type: Type.STRING },
          suggestedFollowUpImaging: { type: Type.STRING },
          disclaimer: { type: Type.STRING },
        },
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim()) as AiDicomImpressionResult;
}

export async function draftConsensusMinutes(
  patientCase: PatientCase,
  votes: ConsensusVote[],
  messages: CaseMessage[],
): Promise<AiMinutesResult> {
  const ai = getAiClient();

  const prompt = [
    `Draft formal Multi-Disciplinary Tumour Board consensus minutes and actionable follow-up items for case ${patientCase.mrn} (${patientCase.primaryDiagnosis}, ${patientCase.tnmT} ${patientCase.tnmN} ${patientCase.tnmM} ${patientCase.stageGroup}).`,
    `Clinical Summary: ${patientCase.clinicalSummary}`,
    `MDT Votes: ${JSON.stringify(votes.map((v) => ({ specialty: v.specialty, option: v.optionLabel, rationale: v.rationale })))}`,
    `Discussion Feed: ${JSON.stringify(messages.slice(-15).map((m) => ({ specialty: m.senderSpecialty, tag: m.tag, body: m.body })))}`,
  ].join('\n\n');

  const response = await ai.models.generateContent({
    model: CLINICAL_MODEL,
    contents: prompt,
    config: {
      systemInstruction:
        'You draft concise, EHR-ready Multi-Disciplinary Tumour Board consensus documentation. Output structured JSON with clear specialty follow-up tasks using only valid specialties: Medical Oncology, Surgical Oncology, Radiation Oncology, Diagnostic Radiology, Molecular Pathology, or MDT Coordinator.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryRecommendation: { type: Type.STRING },
          stagingConfirmed: { type: Type.STRING },
          clinicalRationale: { type: Type.STRING },
          clinicalTrialRecommended: { type: Type.STRING },
          executiveSummary: { type: Type.STRING },
          followUpActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                specialty: { type: Type.STRING },
                task: { type: Type.STRING },
                dueWindow: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim()) as AiMinutesResult;
}

export async function answerCaseQuestion(
  patientCase: PatientCase,
  annotations: ImagingAnnotation[],
  question: string,
  history: { role: 'user' | 'assistant'; text: string }[],
): Promise<string> {
  const ai = getAiClient();
  const context = buildCasePromptContext(patientCase, annotations);
  const transcript = history
    .slice(-8)
    .map((h) => `${h.role === 'user' ? 'Clinician' : 'Assistant'}: ${h.text}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: CLINICAL_MODEL,
    contents: `Case Dossier:\n${context}\n\nPrior Q&A:\n${transcript || 'None'}\n\nClinician Question: ${question}`,
    config: {
      systemInstruction:
        'You are an evidence-based oncology tumour board copilot. Answer clinician questions concisely in 1–3 structured paragraphs using clinical terminology, citing NCCN/ESMO concepts where relevant. Remind the clinician that output is decision support only.',
    },
  });

  return (response.text ?? '').trim();
}
