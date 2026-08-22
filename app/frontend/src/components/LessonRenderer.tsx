import { LessonContent, LessonSection } from '@/lib/vca-lessons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, AlertTriangle, ShieldAlert } from 'lucide-react';

interface LessonRendererProps {
  content: LessonContent;
}

function CalloutBlock({ type, text }: { type: 'info' | 'warning' | 'danger'; text: string }) {
  const styles = {
    info: 'border-l-2 border-sky-500 bg-sky-500/5',
    warning: 'border-l-2 border-[#f59e0b] bg-[#f59e0b]/5',
    danger: 'border-l-2 border-rose-500 bg-rose-500/5',
  };
  const icons = {
    info: <Info className="h-4 w-4 text-sky-400" />,
    warning: <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />,
    danger: <ShieldAlert className="h-4 w-4 text-rose-400" />,
  };

  return (
    <Alert className={`${styles[type]} rounded-md p-4 mb-4 border-0`}>
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0">{icons[type]}</div>
        <AlertDescription className="text-sm text-zinc-200 leading-relaxed">
          {text}
        </AlertDescription>
      </div>
    </Alert>
  );
}

function SectionBlock({ section }: { section: LessonSection }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-zinc-100 mt-6 mb-3">{section.title}</h3>

      {section.paragraphs?.map((p, i) => (
        <p key={i} className="text-sm text-zinc-300 leading-relaxed mb-3">
          {p}
        </p>
      ))}

      {section.bullets && (
        <ul className="list-disc list-inside space-y-1 text-sm text-zinc-300 mb-3">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {section.table && (
        <div className="rounded-md border border-zinc-800/80 overflow-hidden mb-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-900 border-zinc-800/80">
                {section.table.headers.map((h, i) => (
                  <TableHead key={i} className="text-xs font-semibold text-zinc-300">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.table.rows.map((row, ri) => (
                <TableRow key={ri} className="border-zinc-800/80">
                  {row.map((cell, ci) => (
                    <TableCell key={ci} className="text-sm text-zinc-300">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {section.callout && (
        <CalloutBlock type={section.callout.type} text={section.callout.text} />
      )}
    </div>
  );
}

export function LessonRenderer({ content }: LessonRendererProps) {
  return (
    <div className="space-y-2">
      {content.sections.map((section, i) => (
        <SectionBlock key={i} section={section} />
      ))}
    </div>
  );
}