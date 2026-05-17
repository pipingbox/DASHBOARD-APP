import { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#f59e0b]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-bold text-zinc-100">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}