import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Library, ChevronRight } from 'lucide-react';
import AccessoryDetailPage from '@/tools/accessory-library/AccessoryDetailPage';

// Accessory families for the library grid
const FAMILIES = [
  { key: 'butt-weld', nameKey: 'Butt Weld', count: 6 },
  { key: 'flanges', nameKey: 'Flanges', count: 2 },
  { key: 'valves', nameKey: 'Valves', count: 5 },
  { key: 'olets', nameKey: 'Olets', count: 3 },
  { key: 'gaskets', nameKey: 'Gaskets', count: 1 },
  { key: 'fasteners', nameKey: 'Fasteners', count: 1 },
  { key: 'threaded', nameKey: 'Threaded', count: 1 },
  { key: 'special', nameKey: 'Special', count: 1 },
] as const;

// Pilot accessory data for the detail page
const PILOT_ACCESSORY = {
  id: 'PB-COMP-ELBOW-90-LR-BW-ASME-B16-9',
  name: 'Codo 90° LR BW',
  family: 'Butt Weld',
  type: 'Elbow',
  connection: 'BW',
  standard: 'ASME B16.9',
  status: 'approved' as const,
};

export default function AccessoriesLibrary() {
  const { t } = useTranslation();
  const [selectedAccessory, setSelectedAccessory] = useState<string | null>(null);

  if (selectedAccessory) {
    return (
      <AccessoryDetailPage
        accessoryId={selectedAccessory}
        onBack={() => setSelectedAccessory(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">
            {t('tools.accessoriesLibrary', { defaultValue: 'Accessories Library' })}
          </h3>
          <p className="text-xs text-zinc-400">ASME B16.9 / B16.5 / B16.34</p>
        </div>
      </div>

      {/* Family Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FAMILIES.map((family) => (
          <button
            key={family.key}
            onClick={() => setSelectedAccessory(PILOT_ACCESSORY.id)}
            className="group flex items-center justify-between rounded-lg border border-zinc-800/80 bg-[#0d0d0d] p-4 text-left transition-all hover:border-amber-500/30 hover:bg-[#111]"
          >
            <div>
              <p className="text-sm font-medium text-zinc-100">{family.nameKey}</p>
              <p className="text-xs text-zinc-500">{family.count} items</p>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-amber-500" />
          </button>
        ))}
      </div>

      {/* Pilot CTA */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-xs text-zinc-400 mb-2">
          {t('tools.accessoriesLibrary.pilotNote', { defaultValue: 'Pilot accessory available:' })}
        </p>
        <button
          onClick={() => setSelectedAccessory(PILOT_ACCESSORY.id)}
          className="flex items-center gap-2 text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
        >
          <span>{PILOT_ACCESSORY.name}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}