/**
 * workDayPdf.ts — Monthly work-day report PDF generator
 *
 * Uses jsPDF + jspdf-autotable to produce a professional timesheet PDF
 * that workers can submit to their company for payment.
 *
 * All monetary columns are individually toggleable before generation.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WorkDayLog } from './workDayLogs';
import { formatCurrency, getCurrencySymbol } from './currency';

// ─── Column visibility config (user-toggleable) ──────────────────────────────

export interface PdfColumnConfig {
  showLocation: boolean;
  showNormalHours: boolean;
  showExtraHours: boolean;
  showTotalHours: boolean;
  showNormalRate: boolean;
  showExtraRate: boolean;
  showGrossSalary: boolean;
  showKilometers: boolean;
  showTravelAllowance: boolean;
  showFinalTotal: boolean;
  showNotes: boolean;
}

export const DEFAULT_COLUMN_CONFIG: PdfColumnConfig = {
  showLocation: true,
  showNormalHours: true,
  showExtraHours: true,
  showTotalHours: true,
  showNormalRate: false,
  showExtraRate: false,
  showGrossSalary: true,
  showKilometers: false,
  showTravelAllowance: true,
  showFinalTotal: true,
  showNotes: false,
};

export interface PdfReportOptions {
  workerName: string;
  companyName?: string;
  monthLabel: string; // e.g. "August 2026"
  columns: PdfColumnConfig;
  includeSignatureBlock: boolean;
  locale?: string; // for date formatting
}

// ─── Summary totals ───────────────────────────────────────────────────────────

export interface MonthTotals {
  daysWorked: number;
  normalHours: number;
  extraHours: number;
  totalHours: number;
  grossSalary: number;
  travelAllowance: number;
  grandTotal: number;
  currency: string;
}

export function computeMonthTotals(logs: WorkDayLog[]): MonthTotals {
  const totals = logs.reduce(
    (acc, l) => ({
      normalHours: acc.normalHours + l.normal_hours,
      extraHours: acc.extraHours + l.extra_hours,
      grossSalary: acc.grossSalary + l.total_salary,
      travelAllowance: acc.travelAllowance + (l.travel_allowance ?? 0),
      grandTotal: acc.grandTotal + l.final_total,
    }),
    { normalHours: 0, extraHours: 0, grossSalary: 0, travelAllowance: 0, grandTotal: 0 },
  );

  return {
    daysWorked: logs.length,
    normalHours: Math.round(totals.normalHours * 100) / 100,
    extraHours: Math.round(totals.extraHours * 100) / 100,
    totalHours: Math.round((totals.normalHours + totals.extraHours) * 100) / 100,
    grossSalary: Math.round(totals.grossSalary * 100) / 100,
    travelAllowance: Math.round(totals.travelAllowance * 100) / 100,
    grandTotal: Math.round(totals.grandTotal * 100) / 100,
    currency: logs[0]?.currency ?? 'EUR',
  };
}

// ─── PDF generation ───────────────────────────────────────────────────────────

const BRAND_ORANGE = '#F59E0B';
const BRAND_DARK = '#1C1917';
const HEADER_BG: [number, number, number] = [245, 158, 11]; // #F59E0B
const HEADER_TEXT: [number, number, number] = [28, 25, 23]; // dark
const ROW_ALT: [number, number, number] = [249, 250, 251]; // gray-50
const ROW_EVEN: [number, number, number] = [255, 255, 255];
const TOTAL_BG: [number, number, number] = [254, 243, 199]; // amber-100
const TOTAL_TEXT: [number, number, number] = [120, 53, 15]; // amber-900

export function generateMonthlyPdf(
  logs: WorkDayLog[],
  options: PdfReportOptions,
): jsPDF {
  const { workerName, companyName, monthLabel, columns, includeSignatureBlock } = options;
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const totals = computeMonthTotals(sorted);
  const sym = getCurrencySymbol(totals.currency as 'EUR' | 'USD' | 'GBP');
  const fmt = (n: number) => formatCurrency(n, totals.currency as 'EUR' | 'USD' | 'GBP');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header block ────────────────────────────────────────────────────────────
  // Brand bar
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(0, 0, pageW, 16, 'F');

  // Logo text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(BRAND_DARK);
  doc.text('PIPINGBOX', 10, 10.5);

  // Report subtitle in bar
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Monthly Work Report', 10, 14.5);

  // Month / Year (right)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_DARK);
  doc.text(monthLabel, pageW - 10, 10.5, { align: 'right' });

  // Worker / company info block
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(workerName, 10, 23);
  if (companyName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(companyName, 10, 28);
  }

  // Summary strip (right side)
  const summaryX = pageW - 80;
  doc.setFillColor(254, 252, 232); // yellow-50
  doc.roundedRect(summaryX, 18, 70, 22, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 53, 15);
  doc.setFont('helvetica', 'bold');
  doc.text('Days worked', summaryX + 3, 24);
  doc.text('Total hours', summaryX + 25, 24);
  doc.text('Grand total', summaryX + 50, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(String(totals.daysWorked), summaryX + 3, 32);
  doc.text(String(totals.totalHours) + ' h', summaryX + 25, 32);
  doc.setFont('helvetica', 'bold');
  doc.text(fmt(totals.grandTotal), summaryX + 50, 32);

  // ── Build table columns ──────────────────────────────────────────────────────
  interface ColDef { header: string; key: keyof WorkDayLog | 'total_hours'; align?: 'right' | 'center'; width?: number }
  const colDefs: ColDef[] = [
    { header: 'Date', key: 'log_date', width: 22 },
    ...(columns.showLocation ? [{ header: 'Location', key: 'location' as keyof WorkDayLog, width: 30 }] : []),
    ...(columns.showNormalHours ? [{ header: 'Norm. h', key: 'normal_hours' as keyof WorkDayLog, align: 'right' as const, width: 16 }] : []),
    ...(columns.showExtraHours ? [{ header: 'Extra h', key: 'extra_hours' as keyof WorkDayLog, align: 'right' as const, width: 16 }] : []),
    ...(columns.showTotalHours ? [{ header: 'Total h', key: 'total_hours' as const, align: 'right' as const, width: 16 }] : []),
    ...(columns.showNormalRate ? [{ header: `Norm. rate (${sym})`, key: 'normal_rate' as keyof WorkDayLog, align: 'right' as const, width: 22 }] : []),
    ...(columns.showExtraRate ? [{ header: `Extra rate (${sym})`, key: 'extra_rate' as keyof WorkDayLog, align: 'right' as const, width: 22 }] : []),
    ...(columns.showGrossSalary ? [{ header: `Gross (${sym})`, key: 'total_salary' as keyof WorkDayLog, align: 'right' as const, width: 22 }] : []),
    ...(columns.showKilometers ? [{ header: 'Km', key: 'kilometers' as keyof WorkDayLog, align: 'right' as const, width: 14 }] : []),
    ...(columns.showTravelAllowance ? [{ header: `Travel (${sym})`, key: 'travel_allowance' as keyof WorkDayLog, align: 'right' as const, width: 22 }] : []),
    ...(columns.showFinalTotal ? [{ header: `Total (${sym})`, key: 'final_total' as keyof WorkDayLog, align: 'right' as const, width: 24 }] : []),
    ...(columns.showNotes ? [{ header: 'Notes', key: 'notes' as keyof WorkDayLog }] : []),
  ];

  const headers = colDefs.map((c) => c.header);

  const rows = sorted.map((log, i) => {
    return colDefs.map((col) => {
      if (col.key === 'total_hours') return String(log.normal_hours + log.extra_hours);
      const val = log[col.key as keyof WorkDayLog];
      if (val == null) return '—';
      if (typeof val === 'number') {
        const moneyKeys: (keyof WorkDayLog)[] = ['normal_rate', 'extra_rate', 'total_salary', 'travel_allowance', 'final_total', 'kilometer_rate', 'normal_salary', 'extra_salary'];
        if (moneyKeys.includes(col.key as keyof WorkDayLog)) return fmt(val);
        return String(val);
      }
      return String(val);
    });
  });

  // Totals row
  const totalRow = colDefs.map((col) => {
    switch (col.key) {
      case 'log_date': return 'TOTAL';
      case 'location': return '';
      case 'normal_hours': return String(totals.normalHours);
      case 'extra_hours': return String(totals.extraHours);
      case 'total_hours': return String(totals.totalHours);
      case 'normal_rate': return '';
      case 'extra_rate': return '';
      case 'total_salary': return fmt(totals.grossSalary);
      case 'kilometers': return '';
      case 'travel_allowance': return fmt(totals.travelAllowance);
      case 'final_total': return fmt(totals.grandTotal);
      default: return '';
    }
  });

  // ── Render table ─────────────────────────────────────────────────────────────
  autoTable(doc, {
    head: [headers],
    body: [...rows, totalRow],
    startY: 44,
    margin: { left: 10, right: 10 },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: HEADER_TEXT,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: colDefs.reduce((acc, col, idx) => {
      acc[idx] = {
        halign: col.align ?? 'left',
        ...(col.width ? { cellWidth: col.width } : {}),
      };
      return acc;
    }, {} as Record<number, { halign: string; cellWidth?: number }>),
    alternateRowStyles: { fillColor: ROW_ALT },
    rowStyles: { fillColor: ROW_EVEN },
    // Style the totals row differently
    didParseCell(data) {
      if (data.row.index === rows.length) {
        data.cell.styles.fillColor = TOTAL_BG;
        data.cell.styles.textColor = TOTAL_TEXT;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage(data) {
      // Footer: page number + generation date
      const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Generated by PipingBox · ${new Date().toLocaleDateString()} · Page ${data.pageNumber} of ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' },
      );
    },
  });

  // ── Signature block ───────────────────────────────────────────────────────────
  if (includeSignatureBlock) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    const pageH = doc.internal.pageSize.getHeight();
    if (finalY + 30 < pageH) {
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const sigY = finalY + 8;
      // Worker signature
      doc.text('Worker signature:', 10, sigY);
      doc.line(10, sigY + 12, 75, sigY + 12);
      doc.text(workerName, 10, sigY + 17);
      // Company signature
      doc.text('Company signature / stamp:', pageW / 2, sigY);
      doc.line(pageW / 2, sigY + 12, pageW / 2 + 65, sigY + 12);
      if (companyName) doc.text(companyName, pageW / 2, sigY + 17);
    }
  }

  return doc;
}

export function downloadMonthlyPdf(
  logs: WorkDayLog[],
  options: PdfReportOptions,
): void {
  const doc = generateMonthlyPdf(logs, options);
  const safeName = options.workerName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeMonth = options.monthLabel.replace(/\s+/g, '_');
  doc.save(`PipingBox_Report_${safeName}_${safeMonth}.pdf`);
}
