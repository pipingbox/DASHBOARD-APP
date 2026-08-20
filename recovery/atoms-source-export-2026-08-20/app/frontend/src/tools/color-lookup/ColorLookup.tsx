import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Paintbrush, Search } from 'lucide-react';
import { RAL_CLASSIC, searchRal, hexToRgb, type RalColor } from './ralColors';

export default function ColorLookup() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('es')
    ? 'es'
    : i18n.language?.startsWith('de')
      ? 'en'
      : i18n.language?.startsWith('fr')
        ? 'en'
        : i18n.language?.startsWith('nl')
          ? 'en'
          : i18n.language?.startsWith('pt')
            ? 'en'
            : 'en';
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

  // Determine if the active color is light (for text contrast)
  const isLightColor = rgb ? (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 150 : false;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#f59e0b]/20 to-[#f59e0b]/5 border border-[#f59e0b]/30 shadow-lg shadow-[#f59e0b]/5">
          <Paintbrush className="h-5 w-5 text-[#f59e0b]" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-100">
            {t('tools.colorLookup', { defaultValue: 'Industrial Color Lookup' })}
          </h3>
          <p className="text-xs text-zinc-500">
            RAL Classic — {RAL_CLASSIC.length} {t('color.colors', { defaultValue: 'colors' })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-[#f59e0b] transition-colors" />
        <Input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          placeholder={t('color.searchPlaceholder', { defaultValue: 'Search by RAL code or color name... (e.g. 1003, yellow, rojo)' })}
          className="bg-zinc-950 border-zinc-800 pl-10 text-base h-12 rounded-lg focus-visible:ring-[#f59e0b]/50 focus-visible:border-[#f59e0b]/50 transition-all"
          autoFocus
        />
        {query.trim() && results.length > 0 && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-full">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,1.2fr]">
        {/* Results list */}
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
          {query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3">
                <Search className="h-5 w-5 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">
                {t('color.noResults', { defaultValue: 'No colors found' })}
              </p>
            </div>
          )}
          {!query.trim() && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3">
                <Paintbrush className="h-5 w-5 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500">
                {t('color.hint', { defaultValue: 'Type a RAL code (e.g. 3020) or color name' })}
              </p>
            </div>
          )}
          {results.map((color) => {
            const isActive = active?.code === color.code;
            return (
              <button
                key={color.code}
                onClick={() => setSelected(color)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                  isActive
                    ? 'border-[#f59e0b]/60 bg-[#f59e0b]/5 shadow-sm shadow-[#f59e0b]/10'
                    : 'border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/60'
                }`}
              >
                <div
                  className="h-9 w-9 rounded-md border border-zinc-700/50 flex-shrink-0 shadow-inner"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${isActive ? 'text-[#f59e0b]' : 'text-zinc-100'}`}>
                    {color.code}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    {lang === 'es' ? color.name_es : color.name_en}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                  {color.hex}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div>
          {active && rgb ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Large color swatch */}
              <div
                className="h-52 rounded-xl border border-zinc-700/50 flex items-end p-5 relative overflow-hidden shadow-lg"
                style={{ backgroundColor: active.hex }}
              >
                {/* Subtle pattern overlay */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.5) 10px, rgba(255,255,255,0.5) 11px)'
                }} />
                <div className={`relative backdrop-blur-md rounded-lg px-4 py-3 ${isLightColor ? 'bg-black/70' : 'bg-black/50'}`}>
                  <p className="text-xl font-bold text-white tracking-wide">{active.code}</p>
                  <p className="text-sm text-zinc-200">
                    {lang === 'es' ? active.name_es : active.name_en}
                  </p>
                </div>
              </div>

              {/* Color values */}
              <div className="space-y-2.5">
                <Label className="text-[11px] uppercase tracking-widest text-zinc-500 font-medium">
                  {t('color.values', { defaultValue: 'Color Values' })}
                </Label>
                <div className="grid gap-1.5">
                  {[
                    { label: 'HEX', value: active.hex },
                    { label: 'RGB', value: `${rgb.r}, ${rgb.g}, ${rgb.b}` },
                    { label: 'CSS', value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` },
                    { label: 'RAL', value: active.code },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => copyValue(item.label, item.value)}
                      className="relative flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-950/80 px-3.5 py-2.5 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold w-8">{item.label}</span>
                        <span className="font-mono text-sm text-zinc-200">{item.value}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {copied === item.label ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <Check className="h-3 w-3" />
                            Copied
                          </span>
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-zinc-600 group-hover:text-[#f59e0b] transition-colors" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color name in both languages */}
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium uppercase tracking-wide text-[10px]">English</span>
                  <span className="text-zinc-300">{active.name_en}</span>
                </div>
                <div className="h-px bg-zinc-800/50" />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium uppercase tracking-wide text-[10px]">Español</span>
                  <span className="text-zinc-300">{active.name_es}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-52 items-center justify-center rounded-xl border border-dashed border-zinc-800/60 text-sm text-zinc-600 bg-zinc-900/10">
              <Paintbrush className="h-8 w-8 text-zinc-700 mb-3" />
              <p>{t('color.selectColor', { defaultValue: 'Select a color to see details' })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}