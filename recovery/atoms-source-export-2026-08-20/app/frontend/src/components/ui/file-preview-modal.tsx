import { useState, useEffect } from 'react';
import { X, Download, FileText, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface FilePreviewData {
  url: string;
  title: string;
  subtitle?: string;
  expiryDate?: string | null;
  fileName?: string;
  mimeType?: string | null;
}

interface FilePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FilePreviewData | null;
}

type DetectedFileType = 'pdf' | 'image' | 'unknown';

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
];

const PDF_MIME_TYPES = ['application/pdf'];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'];
const PDF_EXTENSIONS = ['.pdf'];

function getExtension(urlOrName: string): string {
  try {
    // Remove query params and hash
    const cleaned = urlOrName.split('?')[0].split('#')[0];
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot === -1) return '';
    return cleaned.substring(lastDot).toLowerCase();
  } catch {
    return '';
  }
}

function detectFileType(
  url: string,
  fileName?: string,
  mimeType?: string | null
): { type: DetectedFileType; extension: string; detectedFrom: string } {
  const extension = getExtension(fileName || url);

  // Priority 1: mime_type from database (if available and not generic)
  if (mimeType && mimeType !== 'application/octet-stream') {
    const lowerMime = mimeType.toLowerCase();
    if (IMAGE_MIME_TYPES.includes(lowerMime)) {
      return { type: 'image', extension, detectedFrom: 'mimeType' };
    }
    if (PDF_MIME_TYPES.includes(lowerMime)) {
      return { type: 'pdf', extension, detectedFrom: 'mimeType' };
    }
    // If mime starts with image/ but not in our list, still treat as image
    if (lowerMime.startsWith('image/')) {
      return { type: 'image', extension, detectedFrom: 'mimeType-prefix' };
    }
  }

  // Priority 2: Check URL for content-type hints (some Supabase URLs include mime info)
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('content-type=image') || lowerUrl.includes('contenttype=image')) {
    return { type: 'image', extension, detectedFrom: 'url-contentType' };
  }
  if (lowerUrl.includes('content-type=application%2fpdf') || lowerUrl.includes('contenttype=application%2fpdf')) {
    return { type: 'pdf', extension, detectedFrom: 'url-contentType' };
  }

  // Priority 3: Fallback to extension parsing (handles application/octet-stream and missing mime)
  if (extension) {
    if (IMAGE_EXTENSIONS.includes(extension)) {
      return { type: 'image', extension, detectedFrom: 'extension' };
    }
    if (PDF_EXTENSIONS.includes(extension)) {
      return { type: 'pdf', extension, detectedFrom: 'extension' };
    }
  }

  // Priority 4: Check if URL path contains recognizable patterns
  const urlPath = lowerUrl.split('?')[0];
  for (const ext of IMAGE_EXTENSIONS) {
    if (urlPath.endsWith(ext)) {
      return { type: 'image', extension: ext, detectedFrom: 'url-path' };
    }
  }
  for (const ext of PDF_EXTENSIONS) {
    if (urlPath.endsWith(ext)) {
      return { type: 'pdf', extension: ext, detectedFrom: 'url-path' };
    }
  }

  return { type: 'unknown', extension, detectedFrom: 'none' };
}

export function FilePreviewModal({ open, onOpenChange, file }: FilePreviewModalProps) {
  const [imageError, setImageError] = useState(false);

  // Reset image error state when file changes
  useEffect(() => {
    setImageError(false);
  }, [file?.url]);

  if (!file) return null;

  const { type: fileType, extension, detectedFrom } = detectFileType(
    file.url,
    file.fileName,
    file.mimeType
  );

  // Debug logging
  console.log({
    fileUrl: file.url,
    mimeType: file.mimeType || 'not provided',
    detectedType: fileType,
    extension,
    detectedFrom,
    fileName: file.fileName,
  });

  const isExpired = file.expiryDate ? new Date(file.expiryDate) < new Date() : false;

  const handleDownload = () => {
    window.open(file.url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] bg-[#0d0d0d] border-zinc-800 p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold text-zinc-100 truncate">
                {file.title}
              </DialogTitle>
              {file.subtitle && (
                <p className="text-xs text-zinc-400 mt-0.5">{file.subtitle}</p>
              )}
              {file.expiryDate && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: isExpired ? '#ef4444' : '#a1a1aa' }} />
                  <span className={`text-[11px] ${isExpired ? 'text-red-400' : 'text-zinc-500'}`}>
                    {isExpired ? 'Expirado' : 'Expira'}: {new Date(file.expiryDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                className="h-8 px-3 text-xs border-[#f59e0b]/40 text-[#f59e0b] hover:bg-[#f59e0b]/10 hover:text-[#f59e0b] gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 min-h-0">
          {fileType === 'pdf' && (
            <div className="w-full h-[70vh] rounded-sm overflow-hidden border border-zinc-800">
              <object
                data={file.url}
                type="application/pdf"
                className="w-full h-full"
              >
                <iframe
                  src={file.url}
                  className="w-full h-full border-0"
                  title={file.title}
                />
              </object>
            </div>
          )}

          {fileType === 'image' && !imageError && (
            <div className="flex items-center justify-center w-full min-h-[40vh] max-h-[70vh]">
              <img
                src={file.url}
                alt={file.title}
                className="max-w-full max-h-[70vh] object-contain rounded-sm border border-zinc-800"
                onError={() => setImageError(true)}
              />
            </div>
          )}

          {(fileType === 'unknown' || (fileType === 'image' && imageError)) && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 mb-4">
                <FileText className="h-7 w-7 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400 mb-1">Vista previa no disponible</p>
              <p className="text-xs text-zinc-600 mb-4">
                Este tipo de archivo no se puede previsualizar en el navegador.
              </p>
              <Button
                size="sm"
                onClick={handleDownload}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs h-8 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar archivo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}