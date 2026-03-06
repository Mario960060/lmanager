import React from 'react';
import { useTranslation } from 'react-i18next';

interface CompactorOption {
  id: string;
  name: string;
  weightRange: string;
  width: number;
  maxLayer: number;
  tempoAvg: number;
  normalizedTempo: number; // tempo / 2 (for layers + 1 calculation)
  materialCoefficient: {
    sand: number;
    type1: number;
  };
}

interface CompactorSelectorProps {
  selectedCompactor: CompactorOption | null;
  onCompactorChange: (compactor: CompactorOption) => void;
}

// Predefined compactor specifications
const COMPACTORS: CompactorOption[] = [
  {
    id: 'small_compactor',
    name: 'Small compactor',
    weightRange: '60–90 kg',
    width: 0.40,
    maxLayer: 5,
    tempoAvg: 55,
    normalizedTempo: 27.5, // 55 / 2
    materialCoefficient: {
      sand: 1.0,
      type1: 1.2
    }
  },
  {
    id: 'medium_compactor',
    name: 'Medium compactor',
    weightRange: '90–150 kg',
    width: 0.50,
    maxLayer: 8,
    tempoAvg: 90,
    normalizedTempo: 45, // 90 / 2
    materialCoefficient: {
      sand: 1.0,
      type1: 1.2
    }
  },
  {
    id: 'large_compactor',
    name: 'Large compactor',
    weightRange: '180–250 kg',
    width: 0.60,
    maxLayer: 12,
    tempoAvg: 130,
    normalizedTempo: 65, // 130 / 2
    materialCoefficient: {
      sand: 1.0,
      type1: 1.2
    }
  },
  {
    id: 'maly_walec',
    name: 'Small roller',
    weightRange: '600–1000 kg',
    width: 0.65,
    maxLayer: 15,
    tempoAvg: 200,
    normalizedTempo: 100, // 200 / 2
    materialCoefficient: {
      sand: 1.0,
      type1: 1.2
    }
  }
];

/** Map project compactor from setup_digging or CompactorOption to CompactorOption for calculations */
export function mapProjectCompactorToOption(dbCompactor: { id?: string; name?: string } | CompactorOption | null): CompactorOption | null {
  if (!dbCompactor) return null;
  // If already a CompactorOption (from static list in project card)
  if ('id' in dbCompactor && COMPACTORS.some(c => c.id === (dbCompactor as CompactorOption).id)) {
    return COMPACTORS.find(c => c.id === (dbCompactor as CompactorOption).id) ?? null;
  }
  if (!(dbCompactor as { name?: string }).name) return null;
  const n = (dbCompactor as { name: string }).name.toLowerCase();
  if (n.includes('roller') || n.includes('walec')) return COMPACTORS.find(c => c.id === 'maly_walec') ?? null;
  if (n.includes('small') || n.includes('mały') || n.includes('maly')) return COMPACTORS.find(c => c.id === 'small_compactor') ?? null;
  if (n.includes('medium') || n.includes('średni') || n.includes('sredni')) return COMPACTORS.find(c => c.id === 'medium_compactor') ?? null;
  if (n.includes('large') || n.includes('duży') || n.includes('duzy')) return COMPACTORS.find(c => c.id === 'large_compactor') ?? null;
  return null;
}

const CompactorSelector: React.FC<CompactorSelectorProps> = ({
  selectedCompactor,
  onCompactorChange
}) => {
  const { t } = useTranslation(['calculator']);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{t('calculator:compactor_type_label')}</label>
      <select
        value={selectedCompactor?.id || ''}
        onChange={(e) => {
          const compactor = COMPACTORS.find(c => c.id === e.target.value);
          if (compactor) {
            onCompactorChange(compactor);
          }
        }}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
      >
        <option value="">{t('calculator:select_compactor_type')}</option>
        {COMPACTORS.map((compactor) => (
          <option key={compactor.id} value={compactor.id}>
            {compactor.name} ({compactor.weightRange})
          </option>
        ))}
      </select>
    </div>
  );
};

export { CompactorSelector, COMPACTORS, type CompactorOption };
