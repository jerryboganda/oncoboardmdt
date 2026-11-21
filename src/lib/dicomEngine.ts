import dicomParser from 'dicom-parser';
import type { DicomPresetKey } from '../types';

export interface WindowPreset {
  id: string;
  label: string;
  windowCenter: number;
  windowWidth: number;
}

export const CLINICAL_WINDOW_PRESETS: WindowPreset[] = [
  { id: 'lung', label: 'Lung', windowCenter: -600, windowWidth: 1500 },
  { id: 'soft_tissue', label: 'Soft Tissue', windowCenter: 40, windowWidth: 400 },
  { id: 'bone', label: 'Bone', windowCenter: 350, windowWidth: 1800 },
  { id: 'brain', label: 'Brain', windowCenter: 40, windowWidth: 80 },
  { id: 'liver', label: 'Liver', windowCenter: 60, windowWidth: 160 },
  { id: 'mediastinum', label: 'Mediastinum', windowCenter: 50, windowWidth: 350 },
];

export interface DicomTagEntry {
  tag: string;
  name: string;
  value: string;
}

export interface DicomSliceData {
  instanceNumber: number;
  sliceLocationMm: number;
  rows: number;
  cols: number;
  pixelSpacingMm: [number, number];
  rescaleSlope: number;
  rescaleIntercept: number;
  defaultWindowCenter: number;
  defaultWindowWidth: number;
  photometricInterpretation: 'MONOCHROME2' | 'MONOCHROME1';
  pixelData: Int16Array;
  tags: DicomTagEntry[];
}

export interface DicomSeriesVolume {
  seriesId: string;
  studyDescription: string;
  seriesDescription: string;
  modality: 'CT' | 'MR' | 'PT';
  patientName: string;
  patientId: string;
  studyDate: string;
  institution: string;
  isUploadedDicom: boolean;
  defaultWindowCenter: number;
  defaultWindowWidth: number;
  slices: DicomSliceData[];
}

/**
 * Converts a stored DICOM integer sample into calibrated Hounsfield Units (CT)
 * or calibrated signal intensity using Rescale Slope and Rescale Intercept.
 */
export function storedValueToHu(storedValue: number, slope: number, intercept: number): number {
  return storedValue * slope + intercept;
}

/**
 * Applies standard DICOM linear Window/Level scaling to produce an 8-bit
 * display intensity in [0, 255].
 */
export function applyWindowLevel(
  huValue: number,
  windowCenter: number,
  windowWidth: number,
  invert = false,
): number {
  const safeWidth = Math.max(1, windowWidth);
  const low = windowCenter - safeWidth / 2;
  const high = windowCenter + safeWidth / 2;

  let gray: number;
  if (huValue <= low) {
    gray = 0;
  } else if (huValue >= high) {
    gray = 255;
  } else {
    gray = Math.round(((huValue - low) / safeWidth) * 255);
  }

  return invert ? 255 - gray : gray;
}

/**
 * Computes calibrated physical millimeter distance between two pixel coordinates
 * using DICOM PixelSpacing [rowSpacingMm, colSpacingMm].
 */
export function calculateRecistDistanceMm(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pixelSpacingMm: [number, number],
): number {
  const [rowSpacing, colSpacing] = pixelSpacingMm;
  const dxMm = (x2 - x1) * colSpacing;
  const dyMm = (y2 - y1) * rowSpacing;
  return Number(Math.sqrt(dxMm * dxMm + dyMm * dyMm).toFixed(1));
}

/**
 * Computes mean Hounsfield Unit intensity along a line segment or single pixel.
 */
export function sampleLineMeanHu(
  slice: DicomSliceData,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
  let sum = 0;
  let count = 0;

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const px = Math.min(slice.cols - 1, Math.max(0, Math.round(x1 + (x2 - x1) * t)));
    const py = Math.min(slice.rows - 1, Math.max(0, Math.round(y1 + (y2 - y1) * t)));
    const raw = slice.pixelData[py * slice.cols + px] ?? 0;
    sum += storedValueToHu(raw, slice.rescaleSlope, slice.rescaleIntercept);
    count++;
  }

  return count > 0 ? Math.round(sum / count) : 0;
}

/**
 * Renders a DICOM slice Int16Array into an RGBA Uint8ClampedArray buffer
 * suitable for HTML5 Canvas ImageData.
 */
export function renderSliceToRgba(
  slice: DicomSliceData,
  windowCenter: number,
  windowWidth: number,
  invert = false,
): Uint8ClampedArray {
  const totalPixels = slice.rows * slice.cols;
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  const effectiveInvert =
    slice.photometricInterpretation === 'MONOCHROME1' ? !invert : invert;

  for (let i = 0; i < totalPixels; i++) {
    const hu = storedValueToHu(slice.pixelData[i], slice.rescaleSlope, slice.rescaleIntercept);
    const gray = applyWindowLevel(hu, windowCenter, windowWidth, effectiveInvert);
    const idx = i * 4;
    rgba[idx] = gray;
    rgba[idx + 1] = gray;
    rgba[idx + 2] = gray;
    rgba[idx + 3] = 255;
  }

  return rgba;
}

// Patients appear only as MRN + initials, so an uploaded file's PatientName (Family^Given)
// is reduced to initials before it reaches the tag table or the viewer HUD.
export function deIdentifyPatientName(dicomName: string): string {
  const parts = dicomName.split(/[\^\s]+/).filter(Boolean);
  const ordered = parts.length > 1 ? [parts[1], parts[0]] : parts;
  const initials = ordered
    .map((p) => p.charAt(0).toUpperCase())
    .filter((ch) => /\p{L}/u.test(ch))
    .join('.');
  return initials ? `${initials}. (De-Identified)` : 'De-Identified';
}

function parseFirstFloat(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const first = raw.split('\\')[0]?.trim();
  const parsed = Number.parseFloat(first ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePixelSpacing(raw: string | undefined): [number, number] {
  if (!raw) return [0.75, 0.75];
  const parts = raw.split('\\').map((p) => Number.parseFloat(p.trim()));
  const row = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 0.75;
  const col = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : row;
  return [row, col];
}

/**
 * Parses a real DICOM Part 10 binary buffer (.dcm) using dicom-parser.
 * Supports uncompressed 8-bit and 16-bit signed/unsigned pixel arrays.
 */
export function parseDicomPart10Buffer(
  buffer: ArrayBuffer,
  fileName: string,
  fallbackIndex = 1,
): {
  slice: DicomSliceData;
  studyDescription: string;
  seriesDescription: string;
  modality: 'CT' | 'MR' | 'PT';
  patientName: string;
  patientId: string;
  studyDate: string;
  institution: string;
} {
  const byteArray = new Uint8Array(buffer);
  if (byteArray.length < 132) {
    throw new Error(`File "${fileName}" is too small to be a valid DICOM Part 10 dataset.`);
  }

  let dataSet: dicomParser.DataSet;
  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch (err) {
    throw new Error(
      `Unable to parse DICOM file "${fileName}": ${err instanceof Error ? err.message : 'Invalid DICOM byte stream'}.`,
    );
  }

  const rows = dataSet.uint16('x00280010');
  const cols = dataSet.uint16('x00280011');
  if (!rows || !cols) {
    throw new Error(`DICOM file "${fileName}" is missing Rows (0028,0010) or Columns (0028,0011).`);
  }

  const pixelElement = dataSet.elements.x7fe00010;
  if (!pixelElement) {
    throw new Error(`DICOM file "${fileName}" does not contain a PixelData (7FE0,0010) element.`);
  }

  if (pixelElement.encapsulatedPixelData) {
    throw new Error(
      `DICOM file "${fileName}" uses compressed/encapsulated pixel syntax. Export as uncompressed Explicit/Implicit VR Little Endian DICOM for direct browser decoding.`,
    );
  }

  const bitsAllocated = dataSet.uint16('x00280100') || 16;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0;
  const samplesPerPixel = dataSet.uint16('x00280002') || 1;
  const rescaleIntercept = parseFirstFloat(dataSet.string('x00281052'), 0);
  const rescaleSlope = parseFirstFloat(dataSet.string('x00281053'), 1);
  const defaultWindowCenter = parseFirstFloat(dataSet.string('x00281050'), 40);
  const defaultWindowWidth = parseFirstFloat(dataSet.string('x00281051'), 400);
  const pixelSpacingMm = parsePixelSpacing(dataSet.string('x00280030'));
  const instanceNumber =
    Number.parseInt(dataSet.string('x00200013') || '', 10) || fallbackIndex;
  const sliceLocationMm = parseFirstFloat(dataSet.string('x00201041'), fallbackIndex * 2.5);
  const photoRaw = (dataSet.string('x00280004') || 'MONOCHROME2').trim();
  const photometricInterpretation =
    photoRaw === 'MONOCHROME1' ? 'MONOCHROME1' : 'MONOCHROME2';

  const expectedCount = rows * cols;
  const pixelData = new Int16Array(expectedCount);
  const offset = byteArray.byteOffset + pixelElement.dataOffset;

  if (bitsAllocated === 16) {
    const view = new DataView(byteArray.buffer, offset, Math.min(pixelElement.length, expectedCount * 2 * samplesPerPixel));
    for (let i = 0; i < expectedCount; i++) {
      const bytePos = i * 2 * samplesPerPixel;
      if (bytePos + 1 >= view.byteLength) break;
      const sample =
        pixelRepresentation === 1
          ? view.getInt16(bytePos, true)
          : view.getUint16(bytePos, true);
      pixelData[i] = Math.max(-32768, Math.min(32767, sample));
    }
  } else {
    for (let i = 0; i < expectedCount; i++) {
      const pos = offset + i * samplesPerPixel;
      if (pos >= byteArray.length) break;
      pixelData[i] = byteArray[pos];
    }
  }

  const modalityRaw = (dataSet.string('x00080060') || 'CT').trim().toUpperCase();
  const modality: 'CT' | 'MR' | 'PT' =
    modalityRaw === 'MR' ? 'MR' : modalityRaw === 'PT' ? 'PT' : 'CT';
  const patientName = deIdentifyPatientName(dataSet.string('x00100010') || '');
  const patientId = (dataSet.string('x00100020') || 'UPLOADED-DCM').trim();
  const studyDate = (dataSet.string('x00080020') || '20261118').trim();
  const studyDescription = (dataSet.string('x00081030') || `Uploaded DICOM (${fileName})`).trim();
  const seriesDescription = (dataSet.string('x0008103e') || 'Uploaded Clinical Series').trim();
  const institution = (dataSet.string('x00080080') || 'External PACS Import').trim();

  const tags: DicomTagEntry[] = [
    { tag: '(0008,0060)', name: 'Modality', value: modality },
    { tag: '(0008,0020)', name: 'StudyDate', value: studyDate },
    { tag: '(0008,1030)', name: 'StudyDescription', value: studyDescription },
    { tag: '(0008,103E)', name: 'SeriesDescription', value: seriesDescription },
    { tag: '(0010,0010)', name: 'PatientName', value: patientName },
    { tag: '(0010,0020)', name: 'PatientID', value: patientId },
    { tag: '(0020,0013)', name: 'InstanceNumber', value: String(instanceNumber) },
    { tag: '(0020,1041)', name: 'SliceLocation', value: `${sliceLocationMm.toFixed(1)} mm` },
    { tag: '(0028,0010)', name: 'Rows × Columns', value: `${rows} × ${cols}` },
    { tag: '(0028,0030)', name: 'PixelSpacing', value: `${pixelSpacingMm[0]} \\ ${pixelSpacingMm[1]} mm` },
    { tag: '(0028,1050)', name: 'WindowCenter', value: String(defaultWindowCenter) },
    { tag: '(0028,1051)', name: 'WindowWidth', value: String(defaultWindowWidth) },
    { tag: '(0028,1052)', name: 'RescaleIntercept', value: String(rescaleIntercept) },
    { tag: '(0028,1053)', name: 'RescaleSlope', value: String(rescaleSlope) },
  ];

  return {
    slice: {
      instanceNumber,
      sliceLocationMm,
      rows,
      cols,
      pixelSpacingMm,
      rescaleSlope,
      rescaleIntercept,
      defaultWindowCenter,
      defaultWindowWidth,
      photometricInterpretation,
      pixelData,
      tags,
    },
    studyDescription,
    seriesDescription,
    modality,
    patientName,
    patientId,
    studyDate,
    institution,
  };
}

// Deterministic pseudo-noise for realistic tissue grain without randomness drift
function tissueGrain(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

interface SyntheticStudySpec {
  seriesId: string;
  studyDescription: string;
  seriesDescription: string;
  modality: 'CT' | 'MR' | 'PT';
  defaultWindowCenter: number;
  defaultWindowWidth: number;
  pixelSpacingMm: [number, number];
  sliceThicknessMm: number;
}

const SYNTHETIC_SPECS: Record<DicomPresetKey, SyntheticStudySpec> = {
  thoracic_ct: {
    seriesId: 'SER-THOR-CT-01',
    studyDescription: 'CT Chest w/ IV Contrast — Staging Protocol',
    seriesDescription: 'Axial 2.0mm Lung/Mediastinum Recon',
    modality: 'CT',
    defaultWindowCenter: -550,
    defaultWindowWidth: 1500,
    pixelSpacingMm: [0.72, 0.72],
    sliceThicknessMm: 2.0,
  },
  neuro_mri: {
    seriesId: 'SER-NEURO-MR-01',
    studyDescription: 'MRI Brain w/ & w/o Gadolinium',
    seriesDescription: 'Axial T1 MPRAGE +C Post-Contrast',
    modality: 'MR',
    defaultWindowCenter: 420,
    defaultWindowWidth: 820,
    pixelSpacingMm: [0.68, 0.68],
    sliceThicknessMm: 1.5,
  },
  breast_mri: {
    seriesId: 'SER-BREAST-MR-01',
    studyDescription: 'Bilateral Breast MRI Dynamic Contrast',
    seriesDescription: 'Axial T1 Fat-Sat Post-Contrast Peak',
    modality: 'MR',
    defaultWindowCenter: 380,
    defaultWindowWidth: 740,
    pixelSpacingMm: [0.65, 0.65],
    sliceThicknessMm: 2.0,
  },
  gi_liver_ct: {
    seriesId: 'SER-GI-CT-01',
    studyDescription: 'CT Abdomen/Pelvis Triphasic Liver Protocol',
    seriesDescription: 'Axial 2.5mm Portal Venous Phase',
    modality: 'CT',
    defaultWindowCenter: 60,
    defaultWindowWidth: 180,
    pixelSpacingMm: [0.78, 0.78],
    sliceThicknessMm: 2.5,
  },
  heme_pet_ct: {
    seriesId: 'SER-HEME-CT-01',
    studyDescription: 'FDG PET-CT Whole Body Staging',
    seriesDescription: 'Axial Diagnostic CT Mediastinal Attenuation',
    modality: 'CT',
    defaultWindowCenter: 50,
    defaultWindowWidth: 360,
    pixelSpacingMm: [0.8, 0.8],
    sliceThicknessMm: 3.0,
  },
};

const volumeCache = new Map<string, DicomSeriesVolume>();

/**
 * Generates a realistic deterministic 16-bit anatomical multi-slice volume
 * (256x256x24) for immediate diagnostic review, Hounsfield Unit probing, and
 * RECIST 1.1 measurement—including optional baseline prior comparison series.
 */
export function buildPreloadedDicomVolume(
  preset: DicomPresetKey,
  patientId: string,
  patientInitials: string,
  isPriorBaseline = false,
): DicomSeriesVolume {
  const cacheKey = `${preset}:${patientId}:${isPriorBaseline ? 'prior' : 'current'}`;
  const cached = volumeCache.get(cacheKey);
  if (cached) return cached;

  const spec = SYNTHETIC_SPECS[preset];
  const size = 256;
  const sliceCount = 24;
  const slices: DicomSliceData[] = [];

  // Prior baseline has slightly larger tumor radius to demonstrate RECIST response tracking
  const lesionScale = isPriorBaseline ? 1.24 : 1.0;

  for (let z = 0; z < sliceCount; z++) {
    const zn = (z / (sliceCount - 1)) * 2 - 1; // -1 to 1
    const pixelData = new Int16Array(size * size);

    for (let y = 0; y < size; y++) {
      const yn = (y / size) * 2 - 1;
      for (let x = 0; x < size; x++) {
        const xn = (x / size) * 2 - 1;
        let hu = -1400;

        if (preset === 'thoracic_ct' || preset === 'heme_pet_ct') {
          const bodyDist = (xn * xn) / 0.72 + (yn * yn) / 0.48;
          if (bodyDist <= 1.0) {
            hu = 45 + tissueGrain(x, y, z) * 8; // Chest wall soft tissue
            if (bodyDist > 0.84) hu = -90 + tissueGrain(x, y, z) * 10; // Subcutaneous fat

            // Bilateral lung fields
            const rightLung = ((xn + 0.34) ** 2) / 0.14 + ((yn + 0.02) ** 2) / 0.23;
            const leftLung = ((xn - 0.34) ** 2) / 0.13 + ((yn + 0.03) ** 2) / 0.22;
            const zLungFactor = 1 - zn * zn * 0.22;

            if (rightLung < zLungFactor || leftLung < zLungFactor) {
              hu = -820 + tissueGrain(x, y, z) * 28;
              // Bronchovascular markings
              const vesselWave = Math.sin(xn * 28 + zn * 4) * Math.cos(yn * 26 - zn * 3);
              if (vesselWave > 0.86) hu = -420;
            }

            // Mediastinum, heart & descending aorta
            const heart = ((xn - 0.06) ** 2) / 0.065 + ((yn + 0.14) ** 2) / 0.085;
            if (heart < 1.0 && zn > -0.5) hu = 110 + tissueGrain(x, y, z) * 12;

            const aorta = ((xn - 0.05) ** 2) + ((yn - 0.14) ** 2);
            if (aorta < 0.0085) hu = 240 + tissueGrain(x, y, z) * 10;

            // Trachea airway
            const trachea = xn * xn + (yn + 0.02) ** 2;
            if (trachea < 0.0045 && zn < 0.15) hu = -960;

            // Thoracic vertebral body + spinal canal
            const spine = ((xn) ** 2) / 0.018 + ((yn - 0.36) ** 2) / 0.014;
            if (spine < 1.0) hu = 620 + tissueGrain(x, y, z) * 35;
            const canal = (xn ** 2) + ((yn - 0.43) ** 2);
            if (canal < 0.0028) hu = 15;

            // Rib arcs
            const ribRing = Math.abs(Math.sqrt(bodyDist) - 0.82);
            if (ribRing < 0.028 && Math.sin(z * 1.45 + Math.atan2(yn, xn) * 2) > 0.15) {
              hu = 780;
            }

            if (preset === 'thoracic_ct') {
              // Spiculated Right Upper Lobe NSCLC primary lesion (anatomical right = viewer left)
              const dx = xn + 0.38;
              const dy = yn + 0.09;
              const dz = (z - 11) / 5.5;
              const angle = Math.atan2(dy, dx);
              const spiculation = 1 + 0.16 * Math.cos(angle * 7) + 0.1 * Math.sin(angle * 11);
              const r = Math.sqrt(dx * dx + dy * dy) / (0.115 * lesionScale * spiculation);
              const sphere = r * r + dz * dz;
              if (sphere < 1.0) {
                hu = 52 + (1 - sphere) * 34 + tissueGrain(x, y, z) * 10;
              }
            } else {
              // Anterior mediastinal bulky lymphoma mass
              const dx = xn + 0.02;
              const dy = yn + 0.24;
              const dz = (z - 11) / 6.0;
              const mass = (dx * dx) / (0.045 * lesionScale * lesionScale) + (dy * dy) / (0.022 * lesionScale * lesionScale) + dz * dz;
              if (mass < 1.0) {
                hu = 68 + tissueGrain(x, y, z) * 9;
              }
            }
          }
        } else if (preset === 'neuro_mri') {
          hu = 18;
          const headDist = (xn * xn) / 0.46 + (yn * yn) / 0.62;
          if (headDist <= 1.0) {
            // Scalp & skull
            if (headDist > 0.88) {
              hu = 520;
            } else if (headDist > 0.78) {
              hu = 65; // Cortical bone dark on T1
            } else {
              // Brain parenchyma (white & gray matter differentiation)
              const sulci = Math.sin(xn * 22) * Math.sin(yn * 22);
              hu = headDist > 0.62 ? 390 + sulci * 35 : 475 + tissueGrain(x, y, z) * 14;

              // Midline falx
              if (Math.abs(xn) < 0.012) hu = 190;

              // Lateral ventricles (CSF dark on T1)
              const ventR = ((xn + 0.09) ** 2) / 0.0055 + ((yn - 0.02) ** 2) / 0.032;
              const ventL = ((xn - 0.09) ** 2) / 0.0055 + ((yn - 0.02) ** 2) / 0.032;
              if ((ventR < 1.0 || ventL < 1.0) && Math.abs(zn) < 0.45) {
                hu = 95;
              }

              // Ring-enhancing Right Frontal Glioblastoma with necrotic core & edema
              const dx = xn + 0.22;
              const dy = yn + 0.16;
              const dz = (z - 12) / 5.0;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz * 0.035);
              const outerR = 0.155 * lesionScale;
              const ringOuter = 0.105 * lesionScale;
              const ringInner = 0.068 * lesionScale;
              if (dist < outerR) {
                hu = 265 + tissueGrain(x, y, z) * 12; // Perilesional hypointense edema
              }
              if (dist < ringOuter && dist >= ringInner) {
                hu = 760 + tissueGrain(x, y, z) * 20; // Bright gadolinium enhancing rim
              } else if (dist < ringInner) {
                hu = 140 + tissueGrain(x, y, z) * 15; // Central necrosis
              }
            }
          }
        } else if (preset === 'gi_liver_ct') {
          const bodyDist = (xn * xn) / 0.75 + (yn * yn) / 0.52;
          if (bodyDist <= 1.0) {
            hu = -85 + tissueGrain(x, y, z) * 9; // Intra-abdominal fat
            if (bodyDist > 0.88) hu = 42; // Abdominal wall musculature

            // Liver (anatomical right = viewer left)
            const liver = ((xn + 0.25) ** 2) / 0.2 + ((yn + 0.04) ** 2) / 0.16;
            if (liver < 1.0 && zn < 0.65) {
              hu = 108 + tissueGrain(x, y, z) * 9; // Portal venous enhancing liver
              // Hypodense colorectal liver metastasis in Segment VII/VIII
              const dx = xn + 0.34;
              const dy = yn - 0.02;
              const dz = (z - 11) / 5.0;
              const metR = Math.sqrt(dx * dx + dy * dy) / (0.105 * lesionScale);
              const met = metR * metR + dz * dz;
              if (met < 1.0) {
                hu = met > 0.72 ? 128 : 42 + tissueGrain(x, y, z) * 7; // Peripheral rim + hypodense center
              }
            }

            // Spleen (anatomical left = viewer right)
            const spleen = ((xn - 0.44) ** 2) / 0.055 + ((yn - 0.06) ** 2) / 0.065;
            if (spleen < 1.0) hu = 118 + tissueGrain(x, y, z) * 8;

            // Stomach
            const stomach = ((xn - 0.16) ** 2) / 0.04 + ((yn + 0.14) ** 2) / 0.035;
            if (stomach < 1.0) hu = -20;

            // Abdominal aorta & lumbar spine
            if (xn * xn + (yn - 0.18) ** 2 < 0.0065) hu = 250;
            const spine = (xn * xn) / 0.022 + ((yn - 0.36) ** 2) / 0.016;
            if (spine < 1.0) hu = 640 + tissueGrain(x, y, z) * 30;
          }
        } else if (preset === 'breast_mri') {
          hu = 15;
          // Prone bilateral breast MRI contour
          const chest = (xn * xn) / 0.75 + ((yn - 0.55) ** 2) / 0.28;
          const rightBreast = ((xn + 0.34) ** 2) / 0.13 + ((yn + 0.12) ** 2) / 0.26;
          const leftBreast = ((xn - 0.34) ** 2) / 0.13 + ((yn + 0.12) ** 2) / 0.26;
          if (chest < 1.0) {
            hu = 210 + tissueGrain(x, y, z) * 12;
          }
          if (rightBreast < 1.0 || leftBreast < 1.0) {
            const fibro = Math.sin(xn * 24) * Math.cos(yn * 20);
            hu = 175 + (fibro > 0.25 ? 115 : 0) + tissueGrain(x, y, z) * 14;
            // Left upper-outer quadrant enhancing IDC lesion (viewer right)
            const dx = xn - 0.39;
            const dy = yn + 0.08;
            const dz = (z - 12) / 4.8;
            const r = Math.sqrt(dx * dx + dy * dy) / (0.095 * lesionScale);
            if (r * r + dz * dz < 1.0) {
              hu = 695 + tissueGrain(x, y, z) * 18;
            }
          }
        }

        pixelData[y * size + x] = Math.round(hu);
      }
    }

    const sliceLoc = Number(((-sliceCount / 2 + z) * spec.sliceThicknessMm).toFixed(1));
    slices.push({
      instanceNumber: z + 1,
      sliceLocationMm: sliceLoc,
      rows: size,
      cols: size,
      pixelSpacingMm: spec.pixelSpacingMm,
      rescaleSlope: 1,
      rescaleIntercept: 0,
      defaultWindowCenter: spec.defaultWindowCenter,
      defaultWindowWidth: spec.defaultWindowWidth,
      photometricInterpretation: 'MONOCHROME2',
      pixelData,
      tags: [
        { tag: '(0008,0060)', name: 'Modality', value: spec.modality },
        { tag: '(0008,0020)', name: 'StudyDate', value: isPriorBaseline ? '20260814' : '20261114' },
        { tag: '(0008,1030)', name: 'StudyDescription', value: isPriorBaseline ? `${spec.studyDescription} (Baseline Prior)` : spec.studyDescription },
        { tag: '(0008,103E)', name: 'SeriesDescription', value: spec.seriesDescription },
        { tag: '(0010,0010)', name: 'PatientName', value: `${patientInitials} (De-Identified)` },
        { tag: '(0010,0020)', name: 'PatientID', value: patientId },
        { tag: '(0020,0013)', name: 'InstanceNumber', value: `${z + 1} / ${sliceCount}` },
        { tag: '(0020,1041)', name: 'SliceLocation', value: `${sliceLoc.toFixed(1)} mm` },
        { tag: '(0028,0010)', name: 'Rows × Columns', value: `${size} × ${size}` },
        { tag: '(0028,0030)', name: 'PixelSpacing', value: `${spec.pixelSpacingMm[0]} \\ ${spec.pixelSpacingMm[1]} mm` },
        { tag: '(0028,1050)', name: 'WindowCenter', value: String(spec.defaultWindowCenter) },
        { tag: '(0028,1051)', name: 'WindowWidth', value: String(spec.defaultWindowWidth) },
      ],
    });
  }

  const volume: DicomSeriesVolume = {
    seriesId: isPriorBaseline ? `${spec.seriesId}-PRIOR` : spec.seriesId,
    studyDescription: isPriorBaseline
      ? `${spec.studyDescription} — Baseline Prior`
      : spec.studyDescription,
    seriesDescription: spec.seriesDescription,
    modality: spec.modality,
    patientName: `${patientInitials} (De-Identified)`,
    patientId,
    studyDate: isPriorBaseline ? '2026-08-14' : '2026-11-14',
    institution: 'OncoBoard Regional Cancer Center PACS',
    isUploadedDicom: false,
    defaultWindowCenter: spec.defaultWindowCenter,
    defaultWindowWidth: spec.defaultWindowWidth,
    slices,
  };

  volumeCache.set(cacheKey, volume);
  return volume;
}
