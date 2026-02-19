import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">{t('event:other_custom_item')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:select_project_label')}
            </label>
            <select
              required
              value={materialData.event_id}
              onChange={(e) => setMaterialData(prev => ({ ...prev, event_id: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:material_name')}
            </label>
            <input
              type="text"
              required
              value={materialData.name}
              onChange={(e) => setMaterialData(prev => ({ ...prev, name: e.target.value }))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('event:enter_material_name')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:quantity_label')}
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={materialData.total_amount || ''}
              onChange={(e) => setMaterialData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('event:enter_quantity')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:unit_label')}
            </label>
            <input
              type="text"
              required
              value={materialData.unit}
              onChange={(e) => setMaterialData(prev => ({ ...prev, unit: e.target.value }))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('event:unit_placeholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('event:notes_label')}
            </label>
            <textarea
              value={materialData.notes}
              onChange={(e) => setMaterialData(prev => ({ ...prev, notes: e.target.value }))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={t('event:add_notes_material')}
              rows={3}
            />
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              {t('common:cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
