import React, { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { X, Plus, Package, AlertCircle, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CalendarMaterialModal from './CalendarMaterialModal';
import CalendarEquipmentModal from './CalendarEquipmentModal';

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
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
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
        .select('id, title')
        .eq('company_id', companyId);

      if (error) throw error;
      
      // Create map for easy lookup
      return data.reduce((acc: Record<string, string>, mat: any) => {
        acc[mat.id] = mat.title;
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {format(date, 'MMMM d, yyyy')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {events.length} {t('event:events_label')} • {equipment.length} {t('event:equipment_in_use')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Events Section */}
          {events.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('event:events_label')}</h3>
              <div className="space-y-4">
                {events.map(event => (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex flex-col space-y-3">
                      <div>
                        <h4 className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                            onClick={() => navigate(`/events/${event.id}`)}>
                          {event.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleAddMaterial(event.id)}
                          className="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm hover:bg-green-200"
                        >
                          <Package className="w-4 h-4 mr-1" />
                          {t('event:add_material')}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedEventForEquipment(event.id);
                            setShowEquipmentModal(true);
                          }}
                          className="inline-flex items-center px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm hover:bg-amber-200"
                        >
                          <Wrench className="w-4 h-4 mr-1" />
                          {t('event:require_equipment')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials Needed Section - Grouped by Project */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('event:materials_needed_label')}</h3>
              <span className="text-sm text-red-600 font-medium flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {t('event:required_materials')}
              </span>
            </div>
            <div className="space-y-6">
              {events.map(event => {
                const eventMaterials = materialsByProject[event.id] || [];
                if (eventMaterials.length === 0) return null;

                return (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-600 mb-3 hover:text-blue-800 cursor-pointer"
                        onClick={() => navigate(`/events/${event.id}`)}>
                      {event.title}
                    </h4>
                    <div className="space-y-3">
                      {eventMaterials.map(material => (
                        <div key={material.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center">
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">
                                {material.material} - {material.quantity}
                              </p>
                              {material.notes && (
                                <p className="text-sm text-gray-500">{material.notes}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {Object.keys(materialsByProject).length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  {t('event:no_materials_needed_today')}
                </p>
              )}
            </div>
          </div>

          {/* Required Equipment Section - Grouped by Project */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('event:required_equipment')}</h3>
              <span className="text-sm text-amber-600 font-medium flex items-center">
                <Wrench className="w-4 h-4 mr-1" />
                {t('event:equipment_needed')}
              </span>
            </div>
            <div className="space-y-6">
              {events.map(event => {
                const eventEquipment = equipmentByProject[event.id] || [];
                if (eventEquipment.length === 0) return null;

                return (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-600 mb-3 hover:text-blue-800 cursor-pointer"
                        onClick={() => navigate(`/events/${event.id}`)}>
                      {event.title}
                    </h4>
                    <div className="space-y-3">
                      {eventEquipment.map(equipment => (
                        <div key={equipment.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center">
                            <Wrench className="w-5 h-5 text-gray-500" />
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">
                                {equipment.equipment?.name} - {equipment.quantity} {equipment.quantity > 1 ? t('event:units_label') : t('event:unit_singular')}
                              </p>
                              {equipment.notes && (
                                <p className="text-sm text-gray-500">{equipment.notes}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {Object.keys(equipmentByProject).length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  {t('event:no_equipment_required_today')}
                </p>
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('event:notes_label')}</h3>
              <button
                onClick={() => setShowNoteForm(true)}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                {t('event:add_note')}
              </button>
            </div>

            {showNoteForm && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('event:event_label')}</label>
                  <select
                    value={selectedEvent || ''}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">{t('event:select_event')}</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>{event.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('event:note_label')}</label>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={t('event:enter_note')}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowNoteForm(false)}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    {t('common:cancel')}
                  </button>
                  <button
                    onClick={handleAddNote}
                    disabled={!selectedEvent || !noteContent.trim() || addNoteMutation.isPending}
                    className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {addNoteMutation.isPending ? t('event:adding') : t('event:add_note')}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {notes.map(note => (
                <div key={note.id} className="bg-gray-50 md:bg-gray-50 bg-red-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-600">
                        {t('event:event_label')}: <span 
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => navigate(`/events/${note.event_id}`)}
                        >
                          {note.events?.title}
                        </span>
                      </p>
                      <p className="text-gray-900 mt-1">{note.content}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(note.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {t('event:added_by')} {note.profiles?.full_name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Material Modal */}
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

      {/* Calendar Equipment Modal */}
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
    </div>
  );
};

export default DayDetailsModal;
