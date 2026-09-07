import { jsPDF } from 'jspdf';
import type { Profile } from '@/hooks/useAuth';
import type { Certification } from './certifications';

/**
 * PB-LEGACY-CERT-QUERIES-001: the CV only consumes certification *metadata*.
 * Evidence files (file_url / certificate_file_url / storage_bucket / storage_path)
 * and signed URLs are deliberately not part of this contract and must never be
 * embedded in the generated PDF.
 *
 * The unified certifications table stores `certification_name` / `issuing_organization`;
 * `name` / `issuer` are legacy aliases that are absent when the row is read with
 * `select('*')`, so both spellings are accepted here.
 */
export type CVCertification = Partial<
  Pick<
    Certification,
    | 'name'
    | 'issuer'
    | 'certification_name'
    | 'issuing_organization'
    | 'credential_id'
    | 'issue_date'
    | 'expiry_date'
    | 'verification_url'
    | 'qr_code_url'
  >
>;

interface GenerateCVParams {
  profile: Profile;
  certifications: CVCertification[];
}

/** Columns the CV is allowed to consume. Evidence locations are excluded by design. */
export const CV_CERTIFICATION_METADATA_COLUMNS = [
  'certification_name',
  'issuing_organization',
  'credential_id',
  'issue_date',
  'expiry_date',
] as const;

/** Canonical column first, legacy `name` alias as fallback. */
export function resolveCvCertificationName(cert: CVCertification): string {
  return cert.certification_name || cert.name || '';
}

/** Canonical column first, legacy `issuer` alias as fallback. */
export function resolveCvCertificationIssuer(cert: CVCertification): string {
  return cert.issuing_organization || cert.issuer || '';
}

/**
 * Projects raw `app_worker_certifications` rows onto the CV metadata contract.
 * Anything not listed in CV_CERTIFICATION_METADATA_COLUMNS — in particular
 * `file_url`, `certificate_file_url`, `storage_bucket` and `storage_path` — is dropped,
 * so an evidence location can never leak into the generated document.
 */
export function mapCertificationRowsForCv(rows: readonly unknown[]): CVCertification[] {
  return rows.map((row) => {
    const source = (row ?? {}) as Record<string, unknown>;
    const mapped: CVCertification = {};
    for (const column of CV_CERTIFICATION_METADATA_COLUMNS) {
      const value = source[column];
      mapped[column] = typeof value === 'string' ? value : null;
    }
    return mapped;
  });
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function generateCV({ profile, certifications }: GenerateCVParams): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ---------- Header ----------
  doc.setFillColor(13, 13, 13);
  doc.rect(0, 0, PAGE_WIDTH, 40, 'F');
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PIPINGBOX · VERIFIED IDENTITY', MARGIN, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(profile.full_name || 'Engineer', MARGIN, 24);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(profile.title || 'Industrial Professional', MARGIN, 31);

  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  const meta = [profile.company, profile.location, `${profile.years_experience || 0} yrs exp`]
    .filter(Boolean)
    .join('  ·  ');
  if (meta) doc.text(meta, MARGIN, 37);

  y = 50;
  doc.setTextColor(0, 0, 0);

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(245, 158, 11);
    doc.text(title.toUpperCase(), MARGIN, y);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_WIDTH, y + 1.5);
    y += 6;
    doc.setTextColor(30, 30, 30);
  };

  // ---------- Bio / Summary ----------
  if (profile.bio) {
    sectionTitle('Professional Summary');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(profile.bio, CONTENT_WIDTH);
    ensureSpace(lines.length * 5 + 4);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 4;
  }

  // ---------- Skills ----------
  if (profile.skills && profile.skills.length > 0) {
    sectionTitle('Skills');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const skillText = profile.skills.join(' · ');
    const lines = doc.splitTextToSize(skillText, CONTENT_WIDTH);
    ensureSpace(lines.length * 5 + 4);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 4;
  }

  // ---------- Experience ----------
  sectionTitle('Experience');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  ensureSpace(6);
  doc.text(profile.title || 'Industrial Professional', MARGIN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  const expLine = [
    profile.company || '—',
    profile.location || '',
    `${profile.years_experience || 0} years`,
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(expLine, MARGIN, y);
  y += 7;
  doc.setTextColor(30, 30, 30);

  // ---------- Certifications ----------
  if (certifications.length > 0) {
    sectionTitle('Certifications');

    for (const cert of certifications) {
      ensureSpace(26);
      const startY = y;

      // Canonical column first, legacy alias as fallback.
      const certName = resolveCvCertificationName(cert);
      const certIssuer = resolveCvCertificationIssuer(cert);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      doc.text(certName, MARGIN, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(certIssuer, MARGIN, y);
      y += 4;

      const detail: string[] = [];
      if (cert.credential_id) detail.push(`ID ${cert.credential_id}`);
      if (cert.issue_date)
        detail.push(`Issued ${new Date(cert.issue_date).toLocaleDateString()}`);
      if (cert.expiry_date)
        detail.push(`Expires ${new Date(cert.expiry_date).toLocaleDateString()}`);
      if (detail.length) {
        doc.setFontSize(8.5);
        doc.setTextColor(120, 120, 120);
        doc.text(detail.join('  ·  '), MARGIN, y);
        y += 4;
      }

      if (cert.verification_url) {
        doc.setFontSize(8);
        doc.setTextColor(245, 158, 11);
        const verLines = doc.splitTextToSize(`Verify: ${cert.verification_url}`, CONTENT_WIDTH - 30);
        doc.text(verLines, MARGIN, y);
        y += verLines.length * 3.5;
      }

      // QR code anchor
      if (cert.qr_code_url && cert.qr_code_url.startsWith('data:image')) {
        try {
          doc.addImage(cert.qr_code_url, 'PNG', PAGE_WIDTH - MARGIN - 22, startY - 2, 22, 22);
        } catch {
          /* ignore invalid QR */
        }
      }

      y = Math.max(y, startY + 24);
      doc.setDrawColor(240, 240, 240);
      doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
      y += 4;
      doc.setTextColor(30, 30, 30);
    }
  }

  // ---------- Footer on each page ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by PipingBox · ${new Date().toLocaleDateString()}`,
      MARGIN,
      PAGE_HEIGHT - 8,
    );
    doc.text(`Page ${i} / ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, {
      align: 'right',
    });
  }

  const safeName = (profile.full_name || 'engineer').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`pipingbox-cv-${safeName}.pdf`);
}