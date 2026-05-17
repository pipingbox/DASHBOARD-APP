import { useTranslation } from 'react-i18next';
import { Check, Globe } from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguageCode,
  changeAppLanguage,
} from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function LanguageSelector({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const currentCode = (i18n.resolvedLanguage || i18n.language || 'en').slice(
    0,
    2,
  ) as SupportedLanguageCode;
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentCode) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('common.language')}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-300 transition hover:border-[#f59e0b] hover:text-[#f59e0b]',
            className,
          )}
        >
          <span className="text-base leading-none" aria-hidden>
            {current.flag}
          </span>
          <span className="uppercase tracking-wider">{current.code}</span>
          <Globe className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 border border-zinc-800 bg-[#0d0d0d] text-zinc-200"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          {t('common.language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-zinc-800" />
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = lang.code === currentCode;
          return (
            <DropdownMenuItem
              key={lang.code}
              onSelect={(e) => {
                e.preventDefault();
                changeAppLanguage(lang.code);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-3 text-sm',
                active
                  ? 'bg-[#f59e0b]/10 text-[#f59e0b] focus:bg-[#f59e0b]/10 focus:text-[#f59e0b]'
                  : 'text-zinc-200 focus:bg-zinc-900 focus:text-zinc-100',
              )}
            >
              <span className="text-base leading-none" aria-hidden>
                {lang.flag}
              </span>
              <span className="flex-1">{lang.label}</span>
              {active && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}