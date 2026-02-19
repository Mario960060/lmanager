import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { Clock, Users } from 'lucide-react';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

const TimeEstimator = () => {
  const { t } = useTranslation(['calculator', 'utilities', 'common']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [selectedTask, setSelectedTask] = useState<TaskTemplate | null>(null);
  const [quantity, setQuantity] = useState('');
  const [workers, setWorkers] = useState('');
  const [result, setResult] = useState<{ totalHours: number; perWorker: number; days: number } | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch task templates
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['task_templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('company_id', companyId)
        .order('name');
      
      if (error) throw error;
      return data as TaskTemplate[];
    },
    enabled: !!companyId
  });

  // Filter tasks by search
  const filteredTasks = search === ''
    ? taskTemplates
    : taskTemplates.filter(task =>
        task.name.toLowerCase().includes(search.toLowerCase())
      );

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const calculateTime = () => {
    if (!selectedTask || !quantity || !workers) return;

    const totalUnits = parseFloat(quantity);
    const numWorkers = parseInt(workers);
    
    if (isNaN(totalUnits) || isNaN(numWorkers) || numWorkers <= 0) return;

    // Calculate total hours needed for all units
    const totalHours = totalUnits * selectedTask.estimated_hours;
    
    // Calculate hours per worker
    const hoursPerWorker = totalHours / numWorkers;
    
    // Calculate working days (8-hour workday)
    const workingDays = Math.ceil(hoursPerWorker / 8);

    setResult({
      totalHours: Number(totalHours.toFixed(1)),
      perWorker: Number(hoursPerWorker.toFixed(1)),
      days: workingDays
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Task Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">{t('calculator:select_task_label')}</label>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={() => setDropdownOpen((open) => !open)}
          >
            {selectedTask ? selectedTask.name : 'Select a task'}
          </button>
          {dropdownOpen && (
            <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg border border-gray-200">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('calculator:search_tasks_label')}
                className="w-full px-3 py-2 border-b border-gray-200 focus:outline-none"
                autoFocus
              />
              <ul className="max-h-60 overflow-auto">
                {filteredTasks.length === 0 ? (
                  <li className="px-3 py-2 text-gray-500">{t('calculator:no_tasks')}</li>
                ) : (
                  filteredTasks.map(task => (
                    <li
                      key={task.id}
                      className={`px-3 py-2 cursor-pointer 
                        hover:bg-gray-200
                        ${selectedTask?.id === task.id ? 'bg-blue-600 text-white font-semibold' : ''}
                      `}
                      onClick={() => {
                        setSelectedTask(task);
                        setDropdownOpen(false);
                        setResult(null);
                      }}
                    >
                      {task.name}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selectedTask && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quantity ({selectedTask.unit})
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setResult(null);
              }}
              min="0.1"
              step="0.1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={`Enter amount in ${selectedTask.unit}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t('calculator:number_of_workers_label')}
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Users className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                value={workers}
                onChange={(e) => {
                  setWorkers(e.target.value);
                  setResult(null);
                }}
                min="1"
                className="block w-full pl-10 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('calculator:enter_number_of_workers')}
              />
            </div>
          </div>

          <button
            onClick={calculateTime}
            disabled={!quantity || !workers}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Calculate
          </button>

          {result && (
            <div className="mt-4 p-4 bg-gray-800 rounded-md space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-300">{t('calculator:total_hours_needed')}</div>
                  <div className="text-2xl font-bold text-white">
                    {result.totalHours}h
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-300">{t('calculator:hours_per_worker')}</div>
                  <div className="text-2xl font-bold text-white">
                    {result.perWorker}h
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-700">
                <div className="text-sm text-gray-300">{t('calculator:estimated_working_days')}</div>
                <div className="text-2xl font-bold text-white">
                  {result.days} days
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Based on 8-hour workday
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeEstimator;
