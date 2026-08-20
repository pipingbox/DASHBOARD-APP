import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Paintbrush, Search } from 'lucide-react';
import { RAL_CLASSIC, searchRal, hexToRgb, type RalColor } from './ralColors';

export default function ColorLookup() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en';
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RalColor | null>(null);
  const [copied, setCopied] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchRal(query).slice(0, 50);
  }, [query]);

  const copyValue = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }, []);

  const active = selected || (results.length === 1 ? results[0] : null);
  const rgb = active ? hexToRgb(active.hex) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f59e0b]/10 border border-[#f59e0b]/30">
          <Paintbrush className="h-5 w-5 text-[#f59e0b]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {t('tools.colorLookup', { defaultValue: 'Industrial Color Lookup' })}
          </h3>
          <p className="text-xs text-zinc-500">
            RAL Classic — {RAL_CLASSIC.length} {t('color.colors', { defaultValue: 'colors' })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder={t('color.searchPlaceholder', { defaultValue: 'Search by RAL code or color name... (e.g. 1003, yellow, rojo)' })}
          className="bg-zinc-950 border-zinc-800 pl-10 text-base h-12 focus-visible:ring-[#f59e0b]"
          autoFocus
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Results list */}
        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
          {query.trim() && results.length === 0 && (
            <p className="text-sm text-zinc-500 py-4 text-center">
              {t('color.noResults', { defaultValue: 'No colors found' })}
            </p>
          )}
          {!query.trim() && (
            <p className="text-sm text-zinc-500 py-4 text-center">
              {t('color.hint', { defaultValue: 'Type a RAL code (e.g. 3020) or color name' })}
            </p>
          )}
          {results.map((color) => (
            <button
              key={color.code}
              onClick={() => setSelected(color)}
              className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                active?.code === color.code
                  ? 'border-[#f59e0b] bg-[#f59e0b]/5'
                  : 'border-zinc-800/50 bg-[#0d0d0d] hover:border-zinc-700'
              }`}
            >
              <div
                className="h-8 w-8 rounded-sm border border-zinc-700 flex-shrink-0"
                style={{ backgroundColor: color.hex }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-100">{color.code}</p>
                <p className="text-xs text-zinc-400 truncate">
                  {lang === 'es' ? color.name_es : color.name_en}
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-600">{color.hex}</span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {active && rgb ? (
            <div className="space-y-4">
              {/* Large color swatch */}
              <div
                className="h-48 rounded-md border border-zinc-700 flex items-end p-4"
                style={{ backgroundColor: active.hex }}
              >
                <div className="bg-black/60 backdrop-blur-sm rounded-sm px-3 py-2">
                  <p className="text-lg font-bold text-white">{active.code}</p>
                  <p className="text-sm text-zinc-200">
                    {lang === 'es' ? active.name_es : active.name_en}
                  </p>
                </div>
              </div>

              {/* Color values */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-zinc-400">
                  {t('color.values', { defaultValue: 'Color Values' })}
                </Label>
                <div className="grid gap-2">
                  {[
                    { label: 'HEX', value: active.hex },
                    { label: 'RGB', value: `${rgb.r}, ${rgb.g}, ${rgb.b}` },
                    { label: 'RGB (css)', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
                    { label: 'RAL', value: active.code },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => copyValue(item.label, item.value)}
                      className="flex items-center justify-between rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 hover:border-zinc-700 transition group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 w-16">{item.label}</span>
                        <span className="font-mono text-sm text-zinc-200">{item.value}</span>
                      </div>
                      <Copy className="h-3.5 w-3.5 text-zinc-600 group-hover:text-[#f59e0b] transition" />
                      {copied === item.label && (
                        <span className="absolute right-8 text-[10px] text-[#f59e0b]">Copied!</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color name in both languages */}
              <div className="rounded-md border border-zinc-800 bg-[#0d0d0d] p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">EN:</span>
                  <span className="text-zinc-300">{active.name_en}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">ES:</span>
                  <span className="text-zinc-300">{active.name_es}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-zinc-800 text-sm text-zinc-600">
              {t('color.selectColor', { defaultValue: 'Select a color to see details' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
