import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ChevronRight,
  CircleDot,
  Ruler,
  Weight,
  Bolt,
  Cog,
  BookOpen,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import { parseQuery, SEARCH_SUGGESTIONS, type SearchResult } from './search-parser';

/**
 * TICKET-001 Fase 5: Technical Search — "The Google of Piping"
 *
 * Natural language search across the Technical Hub.
 * Users type what they need ("brida 6 pulgadas 300 libras") and get instant results.
 *
 * Rule-based NLU (search-parser.ts) — zero API cost, instant results.
 * Handles EN, ES, PT, NL, FR, DE queries.
 *
 * For ambiguous queries, LLM can be added later (Fase 5b).
 */

interface TechnicalSearchProps {
  onSelectResult: (result: SearchResult) => void;
}

export function TechnicalSearch({ onSelectResult }: TechnicalSearchProps) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => parseQuery(query), [query]);

  // Close results on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (result: SearchResult) => {
    onSelectResult(result);
    setShowResults(false);
    setFocused(false);
    setQuery('');
  };

  const showDropdown = focused && (results.length > 0 || (query.length === 0 && focused));

  return (
    <div ref={containerRef} className="relative">
      {/* Search bar */}
      <div className={`flex items-center gap-2 rounded-sm border bg-zinc-950 px-4 py-3 transition-all ${
        focused ? 'border-[#f59e0b]/50 shadow-lg shadow-[#f59e0b]/5' : 'border-zinc-800'
      }`}>
        <Search className={`h-5 w-5 ${focused ? 'text-[#f59e0b]' : 'text-zinc-500'} transition-colors`} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => {
            setFocused(true);
            setShowResults(true);
          }}
          placeholder="Search... e.g., '6 inch flange 300#' or 'brida 6 pulgadas 300 libras'"
          className="h-7 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setFocused(false);
            }}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a0a0a] border border-zinc-800 rounded-sm shadow-2xl shadow-black/50 z-50 max-h-[500px] overflow-y-auto">
          {/* Suggestions (when empty) */}
          {query.length === 0 && (
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium px-2 pb-2">
                Try searching for...
              </p>
              <div className="space-y-0.5">
                {SEARCH_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setQuery(suggestion);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 rounded-sm transition"
                  >
                    <Search className="h-3.5 w-3.5 text-zinc-600" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {query.length > 0 && results.length === 0 && (
            <div className="p-6 text-center">
              <Search className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No results for "{query}"</p>
              <p className="text-[10px] text-zinc-600 mt-1">
                Try: NPS + type + class (e.g., "4" weld neck 300#")
              </p>
            </div>
          )}

          {query.length > 0 && results.length > 0 && (
            <div className="p-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium px-2 py-1.5">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((result, idx) => (
                <SearchResultRow
                  key={idx}
                  result={result}
                  onClick={() => handleSelect(result)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Result Row ─── */

function SearchResultRow({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const Icon = result.category === 'flange' ? CircleDot
    : result.category === 'fitting' ? BookOpen
    : result.category === 'pipe' ? Ruler
    : Wrench;

  const categoryColor = result.category === 'flange' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    : result.category === 'fitting' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    : result.category === 'pipe' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-zinc-900/50 rounded-sm transition group"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${categoryColor}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-200 group-hover:text-[#f59e0b] transition-colors truncate">
            {result.title}
          </p>
          <span className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider border rounded-sm shrink-0 ${categoryColor}`}>
            {result.category}
          </span>
        </div>
        <p className="text-xs text-zinc-500 truncate">{result.subtitle}</p>

        {/* Metadata chips for flanges */}
        {result.metadata && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {Object.entries(result.metadata).slice(0, 4).map(([key, value]) => (
              <span key={key} className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-zinc-800/60 text-zinc-400 rounded-sm">
                {key === 'OD' && <CircleDot className="h-2.5 w-2.5" />}
                {key === 'Thickness' && <Ruler className="h-2.5 w-2.5" />}
                {key === 'Bolts' && <Bolt className="h-2.5 w-2.5" />}
                {key === 'Weight' && <Weight className="h-2.5 w-2.5" />}
                {value}
              </span>
            ))}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-zinc-700 group-hover:text-[#f59e0b] shrink-0 mt-1" />
    </button>
  );
}
