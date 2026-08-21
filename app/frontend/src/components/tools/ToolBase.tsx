import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Download, Image, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToolBaseProps {
  title: string;
  standard: string;
  icon: ReactNode;
  inputs: ReactNode;
  svg: ReactNode;
  results: ReactNode;
  notes?: ReactNode;
  onExportPdf?: () => void;
  onExportImage?: () => void;
  onFavorite?: () => void;
}

export default function ToolBase({
  title,
  standard,
  icon,
  inputs,
  svg,
  results,
  notes,
  onExportPdf,
  onExportImage,
  onFavorite,
}: ToolBaseProps) {
  const { t } = useTranslation();
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 border-b border-[#232A36] pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF8C00]/10 text-[#FF8C00]">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#F5F7FA]">{title}</h3>
          <p className="text-xs text-[#A3A9B3]">{standard}</p>
        </div>
      </div>

      {/* ═══ INPUTS ═══ */}
      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        {inputs}
      </div>

      {/* ═══ SVG TECHNICAL DRAWING ═══ */}
      <div className="rounded-lg border border-[#232A36] bg-[#0E1117] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#A3A9B3]">
          {t('tools.technicalDrawing', { defaultValue: 'Dibujo Técnico' })}
        </p>
        <div className="flex items-center justify-center">
          {svg}
        </div>
      </div>

      {/* ═══ RESULTS TABLE ═══ */}
      <div className="rounded-lg border border-[#232A36] bg-[#151A22] p-4">
        <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[#FF8C00]">
          {t('tools.numericalResults', { defaultValue: 'Resultados Numéricos' })}
        </p>
        {results}
      </div>

      {/* ═══ ADDITIONAL INFO (Collapsible) ═══ */}
      {notes && (
        <div className="rounded-lg border border-[#232A36] bg-[#151A22]">
          <button
            onClick={() => setNotesOpen(!notesOpen)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <span className="text-xs font-medium uppercase tracking-wider text-[#A3A9B3]">
              {t('tools.additionalInfo', { defaultValue: 'Información Adicional' })}
            </span>
            {notesOpen ? (
              <ChevronUp className="h-4 w-4 text-[#A3A9B3]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#A3A9B3]" />
            )}
          </button>
          {notesOpen && <div className="border-t border-[#232A36] p-4">{notes}</div>}
        </div>
      )}

      {/* ═══ ACTIONS ═══ */}
      <div className="flex flex-wrap gap-2 border-t border-[#232A36] pt-4">
        {onExportPdf && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPdf}
            className="border-[#232A36] !bg-[#151A22] hover:!bg-[#232A36] text-[#F5F7FA] text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t('tools.exportPdf', { defaultValue: 'Exportar PDF' })}
          </Button>
        )}
        {onExportImage && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportImage}
            className="border-[#232A36] !bg-[#151A22] hover:!bg-[#232A36] text-[#F5F7FA] text-xs"
          >
            <Image className="mr-1.5 h-3.5 w-3.5" />
            {t('tools.exportImage', { defaultValue: 'Exportar Imagen' })}
          </Button>
        )}
        {onFavorite && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFavorite}
            className="border-[#232A36] !bg-[#151A22] hover:!bg-[#232A36] text-[#FF8C00] text-xs ml-auto"
          >
            <Star className="mr-1.5 h-3.5 w-3.5" />
            {t('tools.saveFavorite', { defaultValue: 'Guardar Favorito' })}
          </Button>
        )}
      </div>
    </div>
  );
}