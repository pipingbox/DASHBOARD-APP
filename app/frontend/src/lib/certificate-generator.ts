import jsPDF from 'jspdf';

interface CertificateData {
  userName: string;
  courseName: string;
  completedModules: number;
  totalModules: number;
  averageScore: number;
  completedAt: Date;
  examType: 'bvca' | 'volvca' | 'full';
}

export function generateCertificate(data: CertificateData): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Fondo
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 297, 210, 'F');

  // Borde dorado
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.5);
  doc.rect(10, 10, 277, 190);

  // Borde interno fino
  doc.setLineWidth(0.3);
  doc.rect(14, 14, 269, 182);

  // Logo / Titulo PipingBox
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PIPINGBOX ACADEMY', 148.5, 35, { align: 'center' });

  // Linea decorativa
  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(0.5);
  doc.line(100, 40, 197, 40);

  // Titulo del certificado
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate of Completion', 148.5, 60, { align: 'center' });

  // Subtitulo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(161, 161, 170);
  doc.text('This certifies that', 148.5, 75, { align: 'center' });

  // Nombre del usuario
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 158, 11);
  doc.text(data.userName, 148.5, 90, { align: 'center' });

  // Texto de completacion
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  const courseLabel = data.examType === 'full'
    ? 'has successfully completed the VCA Safety Certification Preparation Course'
    : data.examType === 'bvca'
    ? 'has successfully completed the B-VCA Safety Preparation Course'
    : 'has successfully completed the VOL-VCA Safety Preparation Course';
  doc.text(courseLabel, 148.5, 105, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(161, 161, 170);
  doc.text(data.courseName, 148.5, 113, { align: 'center' });

  // Stats
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`Modules Completed: ${data.completedModules}/${data.totalModules}`, 148.5, 130, { align: 'center' });
  doc.text(`Average Score: ${data.averageScore}%`, 148.5, 138, { align: 'center' });

  // Fecha
  doc.setFontSize(10);
  doc.setTextColor(161, 161, 170);
  const dateStr = data.completedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(`Completed on ${dateStr}`, 148.5, 150, { align: 'center' });

  // Disclaimer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(
    'This certificate confirms completion of PipingBox preparation course and does not constitute official VCA certification.',
    148.5, 165, { align: 'center' }
  );
  doc.text('Official VCA certification requires passing the exam at an accredited testing center.', 148.5, 170, { align: 'center' });

  // ID del certificado
  const certId = `PB-VCA-${data.completedAt.getTime().toString(36).toUpperCase()}`;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Certificate ID: ${certId}`, 148.5, 185, { align: 'center' });

  return doc;
}

export function downloadCertificate(data: CertificateData) {
  const doc = generateCertificate(data);
  doc.save(`PipingBox-VCA-Certificate-${data.userName.replace(/\s/g, '-')}.pdf`);
}