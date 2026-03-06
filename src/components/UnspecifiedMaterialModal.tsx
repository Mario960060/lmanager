import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, TextInput, Label } from '../themes/uiComponents';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';

interface UnspecifiedMaterialModalProps {
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

const UnspecifiedMaterialModal: React.FC<UnspecifiedMaterialModalProps> = ({ onClose, onSave, projects }) => {
  const { t } = useTranslation(['common', 'form', 'project', 'event']);
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

  const formId = 'unspecified-material-form';
  return (
    <Modal open={true} onClose={onClose} title={t('event:other_custom_item')} width={448}
      footer={
        <div style={{ display: 'flex', gap: spacing.base, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>{t('common:cancel')}</Button>
          <button type="submit" form={formId} style={{ flex: 1, padding: `${spacing.sm} ${spacing["6xl"]}`, borderRadius: radii.lg, background: `linear-gradient(135deg, ${colors.accentBlue}, ${colors.accentBlueDark})`, color: colors.textOnAccent, fontSize: fontSizes.lg, fontWeight: fontWeights.bold, fontFamily: fonts.display, border: 'none', cursor: 'pointer' }}>{t('event:add_material')}</button>
        </div>
      }
    >
        <form id={formId} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
          <div>
            <Label>{t('event:select_project_label')}</Label>
            <select required value={materialData.event_id} onChange={(e) => setMaterialData(prev => ({ ...prev, event_id: e.target.value }))} style={{ marginTop: spacing.xs, width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }}>
              <option value="">{t('event:select_project')}</option>
              {projects.map(project => (<option key={project.id} value={project.id}>{project.title}</option>))}
            </select>
          </div>
          <TextInput label={t('event:material_name')} value={materialData.name} onChange={(v) => setMaterialData(prev => ({ ...prev, name: v }))} placeholder={t('event:enter_material_name')} />
          <TextInput label={t('event:quantity_label')} value={materialData.total_amount || ''} onChange={(v) => setMaterialData(prev => ({ ...prev, total_amount: parseFloat(v) || 0 }))} placeholder={t('event:enter_quantity')} />
          <TextInput label={t('event:unit_label')} value={materialData.unit} onChange={(v) => setMaterialData(prev => ({ ...prev, unit: v }))} placeholder={t('event:unit_placeholder')} />
          <div>
            <Label>{t('event:notes_label')}</Label>
            <textarea value={materialData.notes} onChange={(e) => setMaterialData(prev => ({ ...prev, notes: e.target.value }))} placeholder={t('event:add_notes_material')} rows={3} style={{ marginTop: spacing.xs, width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
          </div>
        </form>
    </Modal>
  );
};

export default UnspecifiedMaterialModal;
