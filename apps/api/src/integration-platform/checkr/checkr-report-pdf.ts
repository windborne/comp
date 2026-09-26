import {
  checkrCandidateUrl,
  type CheckrReport,
} from '@trycompai/integration-platform';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * One-page summary of a Checkr report, attached to the member's background
 * check so the People page shows a report (Checkr's own PDF is not exposed
 * through its API). Leaves out the result and adjudication: attachments are
 * readable by anyone with member:read, including auditors; Checkr holds them.
 */
export async function buildCheckrReportPdf({
  organizationName,
  memberEmail,
  candidateId,
  candidateName,
  report,
  compStatus,
}: {
  organizationName: string;
  memberEmail: string;
  candidateId: string;
  candidateName: string;
  report: CheckrReport;
  compStatus: string;
}): Promise<Buffer> {
  const rows: Array<[string, string]> = [
    ['Name', candidateName || 'n/a'],
    ['Work email', memberEmail],
    ['Checkr candidate', candidateId],
    ['Report', report.id],
    ['Package', report.package ?? 'n/a'],
    ['Report status', report.status],
    ['Ordered', report.created_at ?? 'n/a'],
    ['Completed', report.completed_at ?? 'n/a'],
    ['Status in Comp', compStatus],
    ['Open in Checkr', checkrCandidateUrl(candidateId)],
  ];

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  const margin = 54;
  let y = 792 - margin;
  const ascii = (text: string) => text.replace(/[^\x20-\x7E]/g, '?');

  page.drawText('Background check summary (Checkr)', { x: margin, y, size: 16, font: bold });
  y -= 20;
  page.drawText(
    ascii(`${organizationName} - synced ${new Date().toISOString().slice(0, 10)} from the Checkr API`),
    { x: margin, y, size: 9, font },
  );
  y -= 28;
  for (const [label, value] of rows) {
    page.drawText(ascii(`${label}:`), { x: margin, y, size: 10, font: bold });
    page.drawText(ascii(value), { x: margin + 120, y, size: 10, font });
    y -= 16;
  }
  y -= 12;
  page.drawText(
    'The full screening report is held by Checkr; open the link above with an authorised Checkr account.',
    { x: margin, y, size: 9, font },
  );
  return Buffer.from(await pdf.save());
}
