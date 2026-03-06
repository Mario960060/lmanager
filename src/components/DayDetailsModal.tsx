import React, { useState } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Plus, Package, AlertCircle, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CalendarMaterialModal from './CalendarMaterialModal';
import CalendarEquipmentModal from './CalendarEquipmentModal';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Modal, Button } from '../themes/uiComponents';

interface Event {
  id: string;
  title: string;
  status: string;
  description: string;
}

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: string;
  equipment_id: string;
  event_id: string;
  quantity: number;
}

interface DayDetailsModalProps {
  date: Date;
  events: Event[];
  equipment: Equipment[];
  onClose: () => void;
}

const DayDetailsModal: React.FC<DayDetailsModalProps> = ({ date, events, equipment, onClose }) => {
  const { t, i18n } = useTranslation(['common', 'form', 'utilities', 'event']);
  const dateLocale = i18n.language === 'pl' ? pl : undefined;
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const companyId = useAuthStore(state => state.getCompanyId());
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [selectedEventForMaterial, setSelectedEventForMaterial] = useState<string | null>(null);
  const [selectedEventForEquipment, setSelectedEventForEquipment] = useState<string | null>(null);

  // Fetch day notes for the selected date
  const { data: notes = [] } = useQuery({
    queryKey: ['day_notes', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_notes')
        .select(`
          id,
          event_id,
          content,
          date,
          created_at,
          user_id,
          events (id, title),
          profiles (id, full_name)
        `)
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch all materials for lookup
  const { data: allMaterials = {} } = useQuery({
    queryKey: ['all_materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name')
        .eq('company_id', companyId);

      if (error) throw error;
      
      // Create map for easy lookup
      return data.reduce((acc: Record<string, string>, mat: any) => {
        acc[mat.id] = mat.name;
        return acc;
      }, {});
    },
    enabled: !!companyId
  });

  // Fetch calendar materials for the selected date
  const { data: materials = [] } = useQuery({
    queryKey: ['calendar_materials', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select('*')
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'));
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Fetch calendar equipment for the selected date
  const { data: calendarEquipment = [] } = useQuery({
    queryKey: ['calendar_equipment', date, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_equipment')
        .select(`
          id,
          equipment_id,
          event_id,
          quantity,
          notes,
          equipment (
            id,
            name,
            quantity
          )
        `)
        .eq('company_id', companyId)
        .eq('date', format(date, 'yyyy-MM-dd'));
      
      if (error) throw error;
      return data;
    },
    enabled: !!companyId
  });

  // Group materials by project
  const materialsByProject = materials.reduce((acc: Record<string, any[]>, material) => {
    const eventId = material.event_id || 'unassigned';
    if (!acc[eventId]) {
      acc[eventId] = [];
    }
    acc[eventId].push(material);
    return acc;
  }, {});

  // Group equipment by project
  const equipmentByProject = calendarEquipment.reduce((acc: Record<string, any[]>, equipment) => {
    const eventId = equipment.event_id || 'unassigned';
    if (!acc[eventId]) {
      acc[eventId] = [];
    }
    acc[eventId].push(equipment);
    return acc;
  }, {});

  // Fetch equipment details
  const { data: equipmentDetails = {} } = useQuery({
    queryKey: ['equipment_details', equipment.map(e => e.equipment_id)],
    queryFn: async () => {
      if (equipment.length === 0) return {};
      
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name')
        .eq('company_id', companyId)
        .in('id', equipment.map(e => e.equipment_id));

      if (error) throw error;
      
      return data.reduce((acc: Record<string, { name: string }>, item) => {
        acc[item.id] = { name: item.name };
        return acc;
      }, {});
    },
    enabled: equipment.length > 0
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ eventId, content }: { eventId: string; content: string }) => {
      const { error } = await supabase
        .from('day_notes')
        .insert({
          event_id: eventId,
          content,
          date: format(date, 'yyyy-MM-dd'),
          user_id: user?.id,
          company_id: companyId
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day_notes', date, companyId] });
      setNoteContent('');
      setShowNoteForm(false);
    }
  });

  const handleAddNote = () => {
    if (!selectedEvent || !noteContent.trim()) return;
    addNoteMutation.mutate({ eventId: selectedEvent, content: noteContent });
  };

  const handleAddMaterial = (eventId: string) => {
    setSelectedEventForMaterial(eventId);
    setShowMaterialModal(true);
  };

  return (
    <>
    <Modal open={true} onClose={onClose} title={format(date, 'MMMM d, yyyy')} width={896}>
        <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, margin: `0 0 ${spacing["6xl"]} 0` }}>
          {events.length} {t('event:events_label')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["8xl"], overflowY: 'auto' }}>
          {/* Events Section */}
          {events.length > 0 && (
            <div>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: spacing["5xl"], fontFamily: fonts.display }}>{t('event:events_label')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
                {events.map(event => (
                  <div key={event.id} style={{ background: colors.bgSubtle, padding: spacing["5xl"], borderRadius: radii.lg }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
                      <div>
                        <h4 style={{ fontWeight: fontWeights.medium, color: colors.accentBlue, cursor: 'pointer', fontFamily: fonts.body }} onClick={() => navigate(`/events/${event.id}`)}>{event.title}</h4>
                        <p style={{ fontSize: fontSizes.base, color: colors.textDim, marginTop: spacing.xs, fontFamily: fonts.body }}>{event.description}</p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
                        <Button variant="accent" color={colors.green} onClick={() => handleAddMaterial(event.id)}>
                          <Package style={{ width: 16, height: 16, marginRight: spacing.xs }} />
                          {t('event:add_material')}
                        </Button>
                        <Button variant="accent" color={colors.orange} onClick={() => { setSelectedEventForEquipment(event.id); setShowEquipmentModal(true); }}>
                          <Wrench style={{ width: 16, height: 16, marginRight: spacing.xs }} />
                          {t('event:require_equipment')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials Needed Section - Grouped by Project */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing["5xl"] }}>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, display: 'flex', alignItems: 'center', gap: spacing.sm, fontFamily: fonts.display }}>
                <AlertCircle style={{ width: 16, height: 16, color: colors.red }} />
                {t('event:required_materials')}
                <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.red }}>{materials.length}</span>
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
              {events.map(event => {
                const eventMaterials = materialsByProject[event.id] || [];
                if (eventMaterials.length === 0) return null;
                return (
                  <div key={event.id} style={{ background: colors.bgSubtle, padding: spacing["5xl"], borderRadius: radii.lg }}>
                    <h4 style={{ fontWeight: fontWeights.medium, color: colors.accentBlue, marginBottom: spacing.base, cursor: 'pointer', fontFamily: fonts.body }} onClick={() => navigate(`/events/${event.id}`)}>{event.title}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
                      {eventMaterials.map(material => (
                        <div key={material.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.sm} 0` }}>
                          <div>
                            <p style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.body }}>{material.material} - {material.quantity}</p>
                            {material.notes && <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body }}>{material.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.keys(materialsByProject).length === 0 && (
                <p style={{ color: colors.textDim, textAlign: 'center', padding: spacing["5xl"], fontFamily: fonts.body }}>{t('event:no_materials_needed_today')}</p>
              )}
            </div>
          </div>

          {/* Required Equipment Section - Grouped by Project */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing["5xl"] }}>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, display: 'flex', alignItems: 'center', gap: spacing.sm, fontFamily: fonts.display }}>
                <Wrench style={{ width: 16, height: 16, color: colors.orange }} />
                {t('event:required_equipment')}
                <span style={{ fontSize: fontSizes["2xl"], fontWeight: fontWeights.bold, color: colors.orange }}>{calendarEquipment.length}</span>
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["6xl"] }}>
              {events.map(event => {
                const eventEquipment = equipmentByProject[event.id] || [];
                if (eventEquipment.length === 0) return null;
                return (
                  <div key={event.id} style={{ background: colors.bgSubtle, padding: spacing["5xl"], borderRadius: radii.lg }}>
                    <h4 style={{ fontWeight: fontWeights.medium, color: colors.accentBlue, marginBottom: spacing.base, cursor: 'pointer', fontFamily: fonts.body }} onClick={() => navigate(`/events/${event.id}`)}>{event.title}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
                      {eventEquipment.map(equipment => (
                        <div key={equipment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${spacing.sm} 0` }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Wrench style={{ width: 20, height: 20, color: colors.textDim, marginRight: spacing.base }} />
                            <div>
                              <p style={{ fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textPrimary, fontFamily: fonts.body }}>{equipment.equipment?.name} - {equipment.quantity} {equipment.quantity > 1 ? t('event:units_label') : t('event:unit_singular')}</p>
                              {equipment.notes && <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body }}>{equipment.notes}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.keys(equipmentByProject).length === 0 && (
                <p style={{ color: colors.textDim, textAlign: 'center', padding: spacing["5xl"], fontFamily: fonts.body }}>{t('event:no_equipment_required_today')}</p>
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <h3 style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display }}>{t('event:notes_label')}</h3>
              <button onClick={() => setShowNoteForm(true)} style={{ display: 'flex', alignItems: 'center', fontSize: fontSizes.base, color: colors.accentBlue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: fonts.body }}>
                <Plus style={{ width: 16, height: 16, marginRight: spacing.xs }} />
                {t('event:add_note')}
              </button>
            </div>

            {showNoteForm && (
              <div style={{ background: colors.bgSubtle, padding: spacing["5xl"], borderRadius: radii.lg, marginBottom: spacing["5xl"], display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
                <div>
                  <label style={{ display: 'block', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, fontFamily: fonts.body }}>{t('event:event_label')}</label>
                  <select value={selectedEvent || ''} onChange={(e) => setSelectedEvent(e.target.value)} style={{ marginTop: spacing.xs, width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }}>
                    <option value="">{t('event:select_event')}</option>
                    {events.map(event => (<option key={event.id} value={event.id}>{event.title}</option>))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSecondary, fontFamily: fonts.body }}>{t('event:note_label')}</label>
                  <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={3} placeholder={t('event:enter_note')} style={{ marginTop: spacing.xs, width: '100%', padding: spacing.xl, borderRadius: radii.xl, border: `1px solid ${colors.borderInput}`, background: colors.bgInput, fontFamily: fonts.body, fontSize: fontSizes.base }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.base }}>
                  <Button variant="secondary" onClick={() => setShowNoteForm(false)}>{t('common:cancel')}</Button>
                  <Button onClick={handleAddNote} disabled={!selectedEvent || !noteContent.trim() || addNoteMutation.isPending}>{addNoteMutation.isPending ? t('event:adding') : t('event:add_note')}</Button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing["5xl"] }}>
              {notes.map(note => (
                <div key={note.id} style={{ background: colors.bgSubtle, padding: spacing["5xl"], borderRadius: radii.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body }}>
                        {t('event:event_label')}: <span style={{ color: colors.accentBlue, cursor: 'pointer' }} onClick={() => navigate(`/events/${note.event_id}`)}>{note.events?.title}</span>
                      </p>
                      <p style={{ color: colors.textPrimary, marginTop: spacing.xs, fontFamily: fonts.body }}>{note.content}</p>
                    </div>
                    <span style={{ fontSize: fontSizes.xs, color: colors.textDim }}>{format(new Date(note.created_at), 'MMM d, h:mm a', { locale: dateLocale })}</span>
                  </div>
                  <p style={{ fontSize: fontSizes.xs, color: colors.textDim, marginTop: spacing.sm, fontFamily: fonts.body }}>{t('event:added_by')} {note.profiles?.full_name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
    </Modal>

      {showMaterialModal && selectedEventForMaterial && (
        <CalendarMaterialModal
          eventId={selectedEventForMaterial}
          date={date}
          onClose={() => {
            setShowMaterialModal(false);
            setSelectedEventForMaterial(null);
          }}
        />
      )}

      {showEquipmentModal && selectedEventForEquipment && (
        <CalendarEquipmentModal
          eventId={selectedEventForEquipment}
          date={date}
          onClose={() => {
            setShowEquipmentModal(false);
            setSelectedEventForEquipment(null);
          }}
        />
      )}
    </>
  );
};

export default DayDetailsModal;
