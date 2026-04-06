import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
import { X } from 'lucide-react';

interface UnspecifiedCalendarMaterialModalProps {
  onClose: () => void;
  onSave: (material: {
    name: string;
    total_amount: number;
    unit: string;
    notes: string;
    event_id: string;
  }) => void;
  projects: Array<{
    id: string;
    title: string;
  }>;
}

const UnspecifiedCalendarMaterialModal: React.FC<UnspecifiedCalendarMaterialModalProps> = ({ onClose, onSave, projects }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const [materialData, setMaterialData] = useState({
    name: '',
    total_amount: 0,
    unit: '',
    notes: '',
    event_id: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialData.event_id) {
      alert(t('event:please_select_project'));
      return;
    }
    onSave(materialData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 md:p-4">
      <div className="rounded-lg shadow-lg w-full max-w-md" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold" style={{ color: colors.textPrimary }}>{t('event:other_custom_item')}</h2>
          <button onClick={onClose} style={{ color: colors.textSubtle }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('event:select_project_label')}
            </label>
            <select
              required
              value={materialData.event_id}
              onChange={(e) => setMaterialData(prev => ({ ...prev, event_id: e.target.value }))}
              className="mt-1 block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderDefault }}
            >
              <option value="">{t('event:select_project')}</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('event:material_name')}
            </label>
            <input
              type="text"
              required
              value={materialData.name}
              onChange={(e) => setMaterialData(prev => ({ ...prev, name: e.target.value }))}
              className="block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderDefault }}
              placeholder={t('event:enter_material_name')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('event:quantity_label')}
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={materialData.total_amount || ''}
              onChange={(e) => setMaterialData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
              className="block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderDefault }}
              placeholder={t('event:enter_quantity')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('event:unit_label')}
            </label>
            <input
              type="text"
              required
              value={materialData.unit}
              onChange={(e) => setMaterialData(prev => ({ ...prev, unit: e.target.value }))}
              className="block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderDefault }}
              placeholder={t('event:unit_placeholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: colors.textSecondary }}>
              {t('event:notes_label')}
            </label>
            <textarea
              value={materialData.notes}
              onChange={(e) => setMaterialData(prev => ({ ...prev, notes: e.target.value }))}
              className="block w-full rounded-md shadow-sm"
              style={{ borderColor: colors.borderDefault }}
              placeholder={t('event:add_notes_material')}
              rows={3}
            />
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
              style={{ borderColor: colors.borderDefault, color: colors.textSecondary }}
            >
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
            >
              {t('event:add_material')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnspecifiedCalendarMaterialModal;
