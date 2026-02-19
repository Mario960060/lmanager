import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';

interface InvoiceMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkPricingModal: React.FC<InvoiceMakerModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'calculator']);
  const companyId = useAuthStore(state => state.getCompanyId());
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [invoice, setInvoice] = useState<any>(null);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [editInvoice, setEditInvoice] = useState<any>(null);
  const [showPrices, setShowPrices] = useState<'all' | 'none' | 'totals'>('all');
  const [showHours, setShowHours] = useState<'all' | 'none'>('all');
  const [additionalCosts, setAdditionalCosts] = useState<{ name: string; pricePerUnit: number; quantity: number }[]>([]);
  const [isAddingCost, setIsAddingCost] = useState<boolean>(false);
  const [newCostDraft, setNewCostDraft] = useState<{ name: string; pricePerUnit: number; quantity: number }>({ name: '', pricePerUnit: 0, quantity: 1 });
  const [deleteConfirm, setDeleteConfirm] = useState<{ section: string; taskIdx: number; subIdx?: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Fetch all projects/events for the dropdown
  useEffect(() => {
    if (isOpen && companyId) {
      supabase
        .from('events')
        .select('id, title')
        .eq('company_id', companyId)
        .then(({ data }) => {
          if (data) setProjects(data);
        });
    }
  }, [isOpen, companyId]);

  // Fetch invoice when a project is selected, and parse JSON fields
  useEffect(() => {
    if (selectedProjectId && companyId) {
      supabase
        .from('invoices')
        .select('*')
        .eq('project_id', selectedProjectId)
        .eq('company_id', companyId)
        .single()
        .then(async ({ data }) => {
          if (data) {
            const parseField = (field: any) => {
              if (typeof field === 'string') {
                try {
                  return JSON.parse(field);
                } catch {
                  return field;
                }
              }
              return field;
            };

            let mainTasks = parseField(data.main_tasks) || [];

            // --- Fetch digging/preparation tasks from tasks_done ---
            const { data: diggingPrepTasks } = await supabase
              .from('tasks_done')
              .select('*')
              .eq('event_id', selectedProjectId)
              .eq('company_id', companyId);

            // Filter for digging/preparation/tape 1 tasks
            const extraMainTasks = (diggingPrepTasks || [])
              .filter((t: any) =>
                t.name?.toLowerCase().includes('excavation') ||
                t.name?.toLowerCase().includes('dig') ||
                t.name?.toLowerCase().includes('preparation') ||
                t.name?.toLowerCase().includes('tape 1')
              )
              // Avoid duplicates (if already in mainTasks by name)
              .filter((t: any) =>
                !mainTasks.some((mt: any) => mt.name === t.name)
              )
              // Format to match mainTasks structure
              .map((t: any) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                results: {
                  materials: t.amount
                    ? [{
                        name: t.name,
                        quantity: parseFloat(t.amount),
                        unit: t.unit,
                        pricePerUnit: t.pricePerUnit || 0,
                      }]
                    : [],
                  taskBreakdown: [{
                    name: t.name,
                    hours: t.hours_worked || 0,
                    unit: t.unit,
                    amount: t.amount,
                  }],
                },
              }));

            // Prepend these tasks to the mainTasks array
            mainTasks = [...extraMainTasks, ...mainTasks];

            setInvoice({
              ...data,
              main_tasks: mainTasks,
              main_breakdown: parseField(data.main_breakdown),
              main_materials: parseField(data.main_materials),
              minor_tasks: parseField(data.minor_tasks),
              extra_materials: parseField(data.extra_materials),
              totals: parseField(data.totals),
              additional_costs: parseField(data.additional_costs),
            });
            setAdditionalCosts(parseField(data.additional_costs) || []);
          } else {
            setInvoice(null);
            setAdditionalCosts([]);
          }
        });
    } else {
      setInvoice(null);
      setAdditionalCosts([]);
    }
  }, [selectedProjectId]);

  const handleDownloadPDF = async () => {
    if (!invoice || !previewRef.current) return;

    const clone = previewRef.current.cloneNode(true) as HTMLElement;

    // Remove interactive/editing elements from the clone
    clone.querySelectorAll('[data-no-print]').forEach(el => el.remove());

    // Force print-friendly colors: black text on white background
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#000000';
    clone.style.width = '800px';
    clone.style.padding = '40px';
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';

    // Force ALL elements to dark text (overrides theme/CSS variables)
    clone.querySelectorAll('*').forEach(el => {
      (el as HTMLElement).style.setProperty('color', '#111827', 'important');
    });
    // Green accent elements (totals, prices) - dark green for readability
    clone.querySelectorAll('[class*="text-green"]').forEach(el => {
      (el as HTMLElement).style.setProperty('color', '#15803d', 'important');
    });
    // Muted/secondary text - still dark
    clone.querySelectorAll('[class*="text-gray"]').forEach(el => {
      (el as HTMLElement).style.setProperty('color', '#374151', 'important');
    });
    // Ensure borders are visible on white
    clone.querySelectorAll('hr').forEach(el => {
      (el as HTMLElement).style.setProperty('border-color', '#9ca3af', 'important');
    });

    document.body.appendChild(clone);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - margin * 2);

      while (heightLeft > 0) {
        position -= (pdfHeight - margin * 2);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }

      const projectTitle = projects.find(p => p.id === selectedProjectId)?.title || selectedProjectId;
      pdf.save(`work_pricing_${projectTitle}.pdf`);
    } finally {
      document.body.removeChild(clone);
    }
  };

  const handleSaveInvoice = async () => {
    // Prepare the updated invoice object for Supabase
    const updatedInvoice = {
      ...editInvoice,
      main_tasks: JSON.stringify(editInvoice.main_tasks),
      main_breakdown: JSON.stringify(editInvoice.main_breakdown),
      main_materials: JSON.stringify(editInvoice.main_materials),
      minor_tasks: JSON.stringify(editInvoice.minor_tasks),
      extra_materials: JSON.stringify(editInvoice.extra_materials),
      totals: JSON.stringify(editInvoice.totals),
    };

    const { error } = await supabase
      .from('invoices')
      .update(updatedInvoice)
      .eq('id', editInvoice.id)
      .eq('company_id', companyId);

      if (!error) {
        setInvoice(editInvoice);
        setEditMode(false);
      } else {
        alert(t('common:failed_save_changes'));
      }
  };

  const saveAdditionalCosts = async () => {
    if (!invoice?.id) return;
    await supabase
      .from('invoices')
      .update({ additional_costs: JSON.stringify(additionalCosts) })
      .eq('id', invoice.id)
      .eq('company_id', companyId);
  };

  useEffect(() => {
    if (isOpen && invoice?.id) {
      saveAdditionalCosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalCosts]);

  const handleClose = () => {
    saveAdditionalCosts();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white p-4 md:p-8 rounded-lg w-full relative flex flex-col overflow-y-auto"
        style={{ 
          maxHeight: '95vh',
          minHeight: '80vh',
          width: '100%',
          maxWidth: '1100px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 bg-white text-white text-3xl font-bold rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center shadow-lg hover:bg-gray-300 transition"
          style={{ zIndex: 10 }}
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className="flex-1 overflow-y-auto flex flex-col">
          <h2 className="text-xl md:text-2xl font-bold mb-4">{t('common:work_pricing_title')}</h2>
          <div className="flex flex-col md:flex-row gap-3 md:gap-6 mb-4">
            <div className="w-full md:w-auto">
              <label className="font-semibold mr-2 block md:inline">{t('common:show_prices_label')}</label>
              <select
                className="border rounded p-1 w-full md:w-auto mt-1 md:mt-0"
                value={showPrices}
                onChange={e => setShowPrices(e.target.value as 'all' | 'none' | 'totals')}
              >
                <option value="all">{t('common:show_option_all')}</option>
                <option value="totals">{t('common:show_option_totals')}</option>
                <option value="none">{t('common:show_option_none')}</option>
              </select>
            </div>
            <div className="w-full md:w-auto">
              <label className="font-semibold mr-2 block md:inline">{t('common:show_hrs_needed_label')}</label>
              <select
                className="border rounded p-1 w-full md:w-auto mt-1 md:mt-0"
                value={showHours}
                onChange={e => setShowHours(e.target.value as 'all' | 'none')}
              >
                <option value="all">{t('common:show_option_all')}</option>
                <option value="none">{t('common:show_option_none')}</option>
              </select>
            </div>
          </div>
          <select
            className="block w-full mb-6 border rounded p-2"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
          >
            <option value="">{t('common:select_project_option')}</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          {selectedProjectId && invoice ? (
            <div ref={previewRef}>
              <h3 className="text-lg font-semibold mb-2">{t('common:work_pricing_preview')}</h3>
              {/* Main Tasks Summary */}
              <div className="mb-6">
                <div className="font-bold text-lg mb-2">{t('common:main_tasks_summary')}</div>
                {(invoice.main_tasks || []).map((task: any, idx: number) => {
                  // Calculate total price for materials in this main task
                  const materialsTotal = (task.results?.materials || []).reduce(
                    (sum: number, mat: any) => sum + (Number(mat.quantity) * Number(mat.pricePerUnit) || 0),
                    0
                  );
                  return (
                    <div key={idx} className="mb-4">
                      <div className="font-semibold">{task.name}</div>
                      {/* Main Task Description */}
                      {task.description && (
                        <div className="ml-2 mb-2 text-gray-600 text-sm italic">{task.description}</div>
                      )}
                      {/* Task Breakdown */}
                      {task.results?.taskBreakdown && task.results.taskBreakdown.length > 0 && (
                        <div className="ml-4 mt-1">
                          <div className="font-medium">{t('common:tasks_breakdown_label')}</div>
                          <ul className="list-disc ml-6">
                            {task.results.taskBreakdown.map((breakdown: any, bIdx: number) => {
                              // Calculate price for this breakdown (hours * pricePerHour)
                              const hours = Number(breakdown.hours) || 0;
                              const pricePerHour = Number(breakdown.pricePerHour) || 0;
                              const breakdownPrice = (hours * pricePerHour).toFixed(2);

                              return (
                                <li key={bIdx}>
                                  {breakdown.name || breakdown.task} — 
                                  {typeof breakdown.amount === 'number'
                                    ? ` ${Number.isInteger(breakdown.amount) ? breakdown.amount : breakdown.amount.toFixed(1)}`
                                    : ` ${breakdown.amount}`
                                  } {breakdown.unit}
                                  {showHours === 'all' && (
                                    <>
                                      {' — '}
                                      {typeof breakdown.hours === 'number'
                                        ? ` ${Number(breakdown.hours).toFixed(2)}`
                                        : ` ${breakdown.hours}`
                                      } {t('common:hrs_abbr')}
                                    </>
                                  )}
                                  {showPrices === 'all' && typeof breakdown.pricePerHour === 'number' && !isNaN(breakdown.pricePerHour) ? (
                                    <>
                                      {' — '}£{breakdownPrice}
                                    </>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {/* Materials */}
                      {task.results?.materials && task.results.materials.length > 0 && (
                        <div className="ml-4 mt-2">
                          <div className="font-medium">{t('common:material_required_label')}</div>
                          <ul className="ml-6">
                            {task.results.materials.map((mat: any, mIdx: number) => {
                              const roundedQty = Math.ceil(Number(mat.quantity) || 0);
                              return (
                                <li key={mIdx}>
                                  {mat.name} — 
                                  {` ${roundedQty}`} {mat.unit || ''}
                                  {/* Only show per-material price if showPrices === 'all' */}
                                  {showPrices === 'all' && (
                                    <>
                                      {' — '}
                                      £{(roundedQty * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £{Number(mat.pricePerUnit).toFixed(2)} {t('common:per_unit')} )
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          {/* Show total price if showPrices is 'all' or 'totals' */}
                          {(showPrices === 'all' || showPrices === 'totals') && (
                            <div className="ml-2 mt-1 font-semibold text-green-300">
                              {t('common:total_task_price')} £{
                                (task.results.materials || []).reduce(
                                  (sum: number, mat: any) => sum + (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0),
                                  0
                                ).toFixed(2)
                              }
                            </div>
                          )}
                        </div>
                      )}
                      {/* Thicker line between main tasks */}
                      {idx < (invoice.main_tasks.length - 1) && (
                        <hr className="my-6 border-t-4 border-gray-500" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Minor Tasks Summary */}
              {invoice.minor_tasks && invoice.minor_tasks.length > 0 && (
                <>
                  <hr className="my-6 border-t-4 border-gray-500" />
                  <div className="font-bold text-lg mb-2">{t('common:minor_tasks_summary')}</div>
                  <ul className="ml-6 mb-4">
                    {invoice.minor_tasks.map((task: any, idx: number) => (
                      <li key={idx}>
                        <div>
                          <span>
                            {task.name} (
                              {typeof task.quantity === 'number'
                                ? Number.isInteger(task.quantity) ? task.quantity : task.quantity.toFixed(1)
                                : task.quantity
                              } {task.unit}
                            )
                            {showPrices === 'all' && (
                              <>
                                {' — '}
                                £{(Number(task.quantity) * Number(task.pricePerUnit) || 0).toFixed(2)} ( £{Number(task.pricePerUnit).toFixed(2)} {t('common:per_unit')} )
                              </>
                            )}
                          </span>
                          {/* Minor Task Description */}
                          {task.description && (
                            <div className="ml-2 text-gray-500 text-xs italic">{task.description}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {showPrices === 'all' || showPrices === 'totals' && (
                    <div className="ml-4 mt-1 font-semibold text-green-300">
                      {t('common:total_minor_tasks_price')} £{
                        (invoice.minor_tasks || []).reduce(
                          (sum: number, task: any) =>
                            sum +
                            (typeof task.quantity === 'number' && typeof task.pricePerUnit === 'number'
                              ? task.quantity * task.pricePerUnit
                              : 0),
                          0
                        ).toFixed(2)
                      }
                    </div>
                  )}
                  
                </>
              )}

              {/* Extra Materials */}
              {invoice.extra_materials && invoice.extra_materials.length > 0 && (
                <>
                  <hr className="my-6 border-t-4 border-gray-500" />
                  <div className="font-bold text-lg mb-2">{t('common:extra_materials_label')}</div>
                  <ul className="ml-6 mb-4">
                    {invoice.extra_materials.map((mat: any, idx: number) => {
                      const roundedQty = Math.ceil(Number(mat.quantity) || 0);
                      return (
                        <li key={idx}>
                          {mat.name} — 
                          {` ${roundedQty}`} {mat.unit || ''}
                          {showPrices === 'all' && (
                            <>
                              {' — '}
                              £{(roundedQty * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £{Number(mat.pricePerUnit).toFixed(2)} {t('common:per_unit')} )
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {showPrices === 'all' || showPrices === 'totals' && (
                    <div className="ml-4 mt-1 font-semibold text-green-300">
                      {t('common:total_extra_materials_price')} £{
                        (invoice.extra_materials || []).reduce(
                          (sum: number, mat: any) => sum + (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0),
                          0
                        ).toFixed(2)
                      }
                    </div>
                  )}
                </>
              )}

              {/* Additional Costs Section (editing - excluded from PDF) */}
              <div className="mt-8 mb-8" data-no-print>
                <div className="font-bold text-lg mb-2">{t('common:additional_costs_label')}</div>

                {/* Saved costs - read-only display like task breakdown */}
                {additionalCosts.length > 0 && (
                  <ul className="ml-4 mb-4">
                    {additionalCosts.map((cost, idx) => (
                      <li key={idx} className="mb-1">
                        <span>
                          {cost.name || <span className="italic text-gray-400">{t('common:unnamed')}</span>}
                          {' — '}
                          {cost.quantity} × £{Number(cost.pricePerUnit).toFixed(2)} ={' '}
                          <span className="font-semibold text-green-500">
                            £{(cost.pricePerUnit * cost.quantity).toFixed(2)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Inline editing form - toggle with the Add additional cost button */}
                {isAddingCost && (
                  <div className="flex flex-wrap items-end gap-2 mb-4 p-3 border border-gray-600 rounded-lg bg-gray-800/30">
                    <div className="flex flex-col">
                      <input
                        className="border p-1 w-48 bg-gray-800 text-white rounded"
                        value={newCostDraft.name}
                        onChange={e => setNewCostDraft({ ...newCostDraft, name: e.target.value })}
                        placeholder={t('common:cost_name_placeholder')}
                      />
                      <span className="text-xs text-gray-400 ml-1">{t('common:cost_name_field')}</span>
                    </div>
                    <div className="flex flex-col">
                      <input
                        type="number"
                        className="border p-1 w-20 bg-gray-800 text-white rounded"
                        value={newCostDraft.quantity}
                        onChange={e => setNewCostDraft({ ...newCostDraft, quantity: Number(e.target.value) })}
                        placeholder={t('calculator:quantity_placeholder')}
                      />
                      <span className="text-xs text-gray-400 ml-1">{t('common:quantity_field')}</span>
                    </div>
                    <div className="flex flex-col">
                      <input
                        type="number"
                        step="0.01"
                        className="border p-1 w-24 bg-gray-800 text-white rounded"
                        value={newCostDraft.pricePerUnit || ''}
                        onChange={e => setNewCostDraft({ ...newCostDraft, pricePerUnit: Number(e.target.value) })}
                        placeholder={t('common:price_per_unit_placeholder')}
                      />
                      <span className="text-xs text-gray-400 ml-1">{t('common:price_per_unit_field')}</span>
                    </div>
                    <span className="font-semibold text-green-500 mb-1">
                      £{(newCostDraft.pricePerUnit * newCostDraft.quantity).toFixed(2)}
                    </span>
                    <button
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium mb-1"
                      onClick={() => {
                        setAdditionalCosts([...additionalCosts, { ...newCostDraft }]);
                        setNewCostDraft({ name: '', pricePerUnit: 0, quantity: 1 });
                        setIsAddingCost(false);
                      }}
                    >
                      {t('form:add')}
                    </button>
                    <button
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 mb-1"
                      onClick={() => {
                        setNewCostDraft({ name: '', pricePerUnit: 0, quantity: 1 });
                        setIsAddingCost(false);
                      }}
                    >
                      {t('form:cancel')}
                    </button>
                  </div>
                )}

                <button
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-700"
                  onClick={() => {
                    if (isAddingCost) {
                      setNewCostDraft({ name: '', pricePerUnit: 0, quantity: 1 });
                    }
                    setIsAddingCost(prev => !prev);
                  }}
                >
                  {t('common:add_additional_cost')}
                </button>

                {/* Show total of additional costs */}
                <div className="font-bold mt-4">
                  Additional costs total: <span className="text-green-500">
                    £{additionalCosts.reduce((sum, c) => sum + c.pricePerUnit * c.quantity, 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* In total section */}
              <div className="mb-4">
                <div className="font-bold text-lg mb-2">{t('common:in_total_label')}:</div>
                {/* Total hours */}
                {showHours === 'all' && invoice.totals.totalHours && (
                  <div className="mb-2">
                    <span className="font-medium">{t('common:total_hours_needed_label')}:</span> {Math.ceil(invoice.totals.totalHours)} {t('common:hrs_abbr')}
                  </div>
                )}
                {/* All materials summed up */}
                {(() => {
                  // Gather all main tasks with their total price
                  const mainTasksWithTotal = (invoice.main_tasks || []).map((task: any) => {
                    const total = (task.results?.materials || []).reduce(
                      (sum: number, mat: any) => sum + (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0),
                      0
                    );
                    return {
                      name: task.name,
                      totalPrice: total,
                    };
                  });

                  // Gather all minor tasks with their total price
                  const minorTasksWithTotal = (invoice.minor_tasks || []).map((task: any) => {
                    const total = (Number(task.quantity) * Number(task.pricePerUnit) || 0);
                    return {
                      name: task.name,
                      totalPrice: total,
                    };
                  });

                  // Gather all materials from main tasks and extra materials
                  const materialMap: Record<string, { name: string; quantity: number; unit?: string; pricePerUnit?: number; totalPrice?: number }> = {};
                  (invoice.main_tasks || []).forEach((task: any) => {
                    (task.results?.materials || []).forEach((mat: any) => {
                      const key = `${mat.name}_${mat.unit || ''}`;
                      if (!materialMap[key]) {
                        materialMap[key] = {
                          name: mat.name,
                          quantity: 0,
                          unit: mat.unit,
                          pricePerUnit: mat.pricePerUnit,
                          totalPrice: 0,
                        };
                      }
                      materialMap[key].quantity += Number(mat.quantity) || 0;
                      materialMap[key].totalPrice += (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0);
                    });
                  });
                  (invoice.extra_materials || []).forEach((mat: any) => {
                    const key = `${mat.name}_${mat.unit || ''}`;
                    if (!materialMap[key]) {
                      materialMap[key] = {
                        name: mat.name,
                        quantity: 0,
                        unit: mat.unit,
                        pricePerUnit: mat.pricePerUnit,
                        totalPrice: 0,
                      };
                    }
                    materialMap[key].quantity += Number(mat.quantity) || 0;
                    materialMap[key].totalPrice += (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0);
                  });
                  const allMaterials = Object.values(materialMap);

                  // Calculate grand total
                  const mainTasksTotal = mainTasksWithTotal.reduce((sum, t) => sum + t.totalPrice, 0);
                  const minorTasksTotal = minorTasksWithTotal.reduce((sum, t) => sum + t.totalPrice, 0);
                  const materialsTotal = allMaterials.reduce((sum, m) => sum + (m.totalPrice || 0), 0);
                  const additionalCostsTotal = additionalCosts.reduce((sum, c) => sum + c.pricePerUnit * c.quantity, 0);
                  const grandTotal = mainTasksTotal + minorTasksTotal + materialsTotal + additionalCostsTotal;

                  return (
                    <div>
                      {/* Main tasks with only total price */}
                      <div className="font-medium mb-1">{t('common:main_tasks_total_prices')}:</div>
                      <ul className="ml-6 mb-2">
                        {mainTasksWithTotal.map((task, idx) => (
                          <li key={idx}>
                            {task.name} — <span className="font-semibold text-green-400">£{task.totalPrice.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                      {/* Minor tasks with only total price */}
                      {minorTasksWithTotal.length > 0 && (
                        <>
                          <div className="font-medium mt-4 mb-1">{t('common:minor_tasks_total_prices')}:</div>
                          <ul className="ml-6 mb-2">
                            {minorTasksWithTotal.map((task, idx) => (
                              <li key={idx}>
                                {task.name} — <span className="font-semibold text-green-400">£{task.totalPrice.toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {/* All materials required */}
                      {allMaterials.length > 0 && (
                        <>
                          <div className="font-medium mt-4 mb-1">{t('common:all_materials_required')}:</div>
                          <ul className="ml-6 mb-2">
                            {allMaterials.map((mat, idx) => {
                              const roundedQty = Math.ceil(Number(mat.quantity) || 0);
                              return (
                                <li key={idx}>
                                  {mat.name} — 
                                  {` ${roundedQty}`} {mat.unit || ''}
                                  {showPrices !== 'none' && (
                                    <>
                                      {' — '}
                                      <span className="font-semibold text-green-400">
                                        £{(mat.totalPrice || 0).toFixed(2)}
                                      </span>
                                    </>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                      {/* Additional Costs Results (just the results, not the input section) */}
                      {additionalCosts.length > 0 && (
                        <>
                          <div className="font-medium mt-4 mb-1">{t('common:additional_costs_label')}:</div>
                          <ul className="ml-6 mb-2">
                            {additionalCosts.map((cost, idx) => (
                              <li key={idx}>
                                {cost.name || <span className="italic text-gray-400">{t('common:unnamed')}</span>} — {cost.quantity} × £{cost.pricePerUnit.toFixed(2)} = <span className="font-semibold text-green-400">£{(cost.pricePerUnit * cost.quantity).toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="ml-6 font-semibold text-green-400">
                            Total additional costs: £{additionalCosts.reduce((sum, c) => sum + c.pricePerUnit * c.quantity, 0).toFixed(2)}
                          </div>
                        </>
                      )}
                      {/* Grand total */}
                      <div className="font-bold mt-6 text-lg">
                        {t('common:total_costs_label')}: <span className="text-green-500">£{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : selectedProjectId ? (
            <div className="text-gray-500">{t('common:no_work_pricing_found')}</div>
          ) : (
            <div className="text-gray-500">{t('common:select_project_to_preview')}</div>
          )}
        </div>
        <div className="flex gap-2 mt-6">
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm"
            onClick={handleDownloadPDF}
            disabled={!invoice}
          >
            {t('common:download_pdf')}
          </button>
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 text-sm"
            onClick={() => {
              setEditInvoice(JSON.parse(JSON.stringify(invoice)));
              setEditMode(true);
            }}
            disabled={!invoice}
          >
            {t('common:edit')}
          </button>
        </div>
      </div>
      {editMode && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setEditMode(false)}
        >
          <div
            className="bg-gray-800 rounded-xl w-full relative flex flex-col"
            style={{
              maxHeight: '95vh',
              minHeight: '80vh',
              width: '100%',
              maxWidth: '1100px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky header with title + actions */}
            <div className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-lg md:text-xl font-bold text-white">{t('common:edit_work_pricing_title')}</h2>
              <div className="flex items-center gap-2">
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors"
                  onClick={handleSaveInvoice}
                >
                  Save
                </button>
                <button
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-500 text-sm font-semibold transition-colors"
                  onClick={() => setEditMode(false)}
                >
                  Cancel
                </button>
                <button
                  className="bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600 text-xl font-bold rounded-lg w-9 h-9 flex items-center justify-center transition-colors ml-1 min-h-0 min-w-0"
                  onClick={() => setEditMode(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 space-y-8">

              {/* ===== MAIN TASKS ===== */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('common:main_tasks_label')}</span>
                  <div className="flex-1 h-px bg-gray-600" />
                </div>

                <div className="space-y-4">
                  {(editInvoice.main_tasks || []).map((task: any, idx: number) => {
                    const materialsTotal = (task.results?.materials || []).reduce(
                      (sum: number, mat: any) => sum + (Number(mat.quantity) * Number(mat.pricePerUnit) || 0),
                      0
                    );
                    return (
                      <div key={idx} className="border border-gray-600 rounded-xl bg-gray-750 overflow-hidden" style={{ backgroundColor: 'rgba(55, 65, 81, 0.5)' }}>
                        {/* Task header */}
                        <div className="px-4 pt-4 pb-3 border-b border-gray-600/50">
                          <input
                            className="!w-full !bg-transparent !border-none !text-white !text-lg !font-bold !p-0 !shadow-none !ring-0 focus:!ring-0 placeholder-gray-500"
                            value={task.name}
                            onChange={e => {
                              const updated = [...editInvoice.main_tasks];
                              updated[idx].name = e.target.value;
                              setEditInvoice({ ...editInvoice, main_tasks: updated });
                            }}
                            placeholder={t('common:task_name_placeholder')}
                          />
                          <textarea
                            className="!w-full !bg-transparent !border-none !text-gray-400 !text-sm !p-0 !mt-1 !shadow-none !ring-0 focus:!ring-0 !resize-none placeholder-gray-600"
                            value={task.description || ''}
                            onChange={e => {
                              const updated = [...editInvoice.main_tasks];
                              updated[idx].description = e.target.value;
                              setEditInvoice({ ...editInvoice, main_tasks: updated });
                            }}
                            placeholder={t('common:task_description_placeholder')}
                            rows={1}
                          />
                        </div>

                        <div className="px-4 py-3 space-y-4">
                          {/* Breakdown sub-section */}
                          {(task.results?.taskBreakdown || []).length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('common:breakdown_label')}</div>
                              {/* Column headers */}
                              <div className="hidden md:grid md:grid-cols-[2fr_1fr_80px_1fr_1fr_90px] gap-2 mb-1 px-1">
                                <span className="text-[10px] text-gray-500 uppercase">Name</span>
                                <span className="text-[10px] text-gray-500 uppercase">Amount</span>
                                <span className="text-[10px] text-gray-500 uppercase">Unit</span>
                                <span className="text-[10px] text-gray-500 uppercase">Hours</span>
                                <span className="text-[10px] text-gray-500 uppercase">Price/hr</span>
                                <span className="text-[10px] text-gray-500 uppercase text-right">Total</span>
                              </div>
                              {(task.results.taskBreakdown || []).map((breakdown: any, bIdx: number) => {
                                let amountValue = '';
                                let unitValue = breakdown.unit || '';
                                if (typeof breakdown.amount === 'string') {
                                  const match = breakdown.amount.match(/^(\d+(\.\d+)?)(.*)$/);
                                  if (match) {
                                    amountValue = match[1];
                                    if (!breakdown.unit) unitValue = match[3].trim();
                                  }
                                } else if (typeof breakdown.amount === 'number') {
                                  amountValue = breakdown.amount;
                                }
                                const hours = Number(breakdown.hours) || 0;
                                const pricePerHour = Number(breakdown.pricePerHour) || 0;
                                const breakdownPrice = (hours * pricePerHour).toFixed(2);

                                return (
                                  <div key={bIdx} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_80px_1fr_1fr_90px] gap-2 mb-2 items-center">
                                    <div className="col-span-2 md:col-span-1">
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Name</label>
                                      <input
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={breakdown.name || breakdown.task || breakdown.title || ''}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.taskBreakdown[bIdx].name = e.target.value;
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('common:breakdown_name_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Amount</label>
                                      <input
                                        type="number"
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={amountValue}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.taskBreakdown[bIdx].amount = Number(e.target.value);
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('common:amount_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Unit</label>
                                      <input
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={unitValue}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.taskBreakdown[bIdx].unit = e.target.value;
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('common:unit_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Hours</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={
                                          breakdown.hours !== undefined && breakdown.hours !== null
                                            ? Number(breakdown.hours).toFixed(2)
                                            : ''
                                        }
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.taskBreakdown[bIdx].hours = Number(e.target.value);
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('common:hours_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Price/hr</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={
                                          breakdown.pricePerHour !== undefined && breakdown.pricePerHour !== null
                                            ? breakdown.pricePerHour
                                            : ''
                                        }
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.taskBreakdown[bIdx].pricePerHour = Number(e.target.value);
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('common:price_hr_placeholder')}
                                      />
                                    </div>
                                    <div className="flex items-center justify-end gap-1">
                                      <span className="text-green-400 font-semibold text-sm">£{breakdownPrice}</span>
                                      {deleteConfirm?.section === 'breakdown' && deleteConfirm.taskIdx === idx && deleteConfirm.subIdx === bIdx ? (
                                        <>
                                          <button className="text-xs bg-red-600 px-1.5 py-0.5 rounded text-white hover:bg-red-700" onClick={() => {
                                            const updated = [...editInvoice.main_tasks];
                                            updated[idx].results.taskBreakdown = updated[idx].results.taskBreakdown.filter((_: any, i: number) => i !== bIdx);
                                            setEditInvoice({ ...editInvoice, main_tasks: updated });
                                            setDeleteConfirm(null);
                                          }}>Yes</button>
                                          <button className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-white hover:bg-gray-500" onClick={() => setDeleteConfirm(null)}>No</button>
                                        </>
                                      ) : (
                                        <button className="!min-w-0 !min-h-0 w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 leading-none shrink-0" onClick={() => setDeleteConfirm({ section: 'breakdown', taskIdx: idx, subIdx: bIdx })}>−</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Separator between breakdown and materials */}
                          {(task.results?.taskBreakdown || []).length > 0 && (task.results?.materials || []).length > 0 && (
                            <div className="h-px bg-gray-600/50" />
                          )}

                          {/* Materials sub-section */}
                          {(task.results?.materials || []).length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('common:materials_label')}</div>
                              {/* Column headers */}
                              <div className="hidden md:grid md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 mb-1 px-1">
                                <span className="text-[10px] text-gray-500 uppercase">Name</span>
                                <span className="text-[10px] text-gray-500 uppercase">Quantity</span>
                                <span className="text-[10px] text-gray-500 uppercase">Unit</span>
                                <span className="text-[10px] text-gray-500 uppercase">Price/unit</span>
                                <span className="text-[10px] text-gray-500 uppercase text-right">Total</span>
                              </div>
                              {(task.results.materials || []).map((mat: any, mIdx: number) => {
                                const total = (Number(mat.quantity) * Number(mat.pricePerUnit) || 0).toFixed(2);
                                return (
                                  <div key={mIdx} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 mb-2 items-center">
                                    <div className="col-span-2 md:col-span-1">
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Name</label>
                                      <input
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={mat.name}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.materials[mIdx].name = e.target.value;
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('calculator:material_name_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Qty</label>
                                      <input
                                        type="number"
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={mat.quantity ?? ''}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.materials[mIdx].quantity = Number(e.target.value);
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('calculator:quantity_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Unit</label>
                                      <input
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={mat.unit}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.materials[mIdx].unit = e.target.value;
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('calculator:unit_placeholder')}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Price/unit</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                        value={mat.pricePerUnit !== undefined && mat.pricePerUnit !== null ? mat.pricePerUnit : ''}
                                        onChange={e => {
                                          const updated = [...editInvoice.main_tasks];
                                          updated[idx].results.materials[mIdx].pricePerUnit = Number(e.target.value);
                                          setEditInvoice({ ...editInvoice, main_tasks: updated });
                                        }}
                                        placeholder={t('calculator:price_per_unit_placeholder')}
                                      />
                                    </div>
                                    <div className="flex items-center justify-end gap-1 min-w-[100px]">
                                      <span className="text-green-400 text-sm">
                                        £{total} <span className="text-gray-500 text-xs">(£{Number(mat.pricePerUnit).toFixed(2)}/u)</span>
                                      </span>
                                      {deleteConfirm?.section === 'material' && deleteConfirm.taskIdx === idx && deleteConfirm.subIdx === mIdx ? (
                                        <>
                                          <button className="text-xs bg-red-600 px-1.5 py-0.5 rounded text-white hover:bg-red-700" onClick={() => {
                                            const updated = [...editInvoice.main_tasks];
                                            updated[idx].results.materials = updated[idx].results.materials.filter((_: any, i: number) => i !== mIdx);
                                            setEditInvoice({ ...editInvoice, main_tasks: updated });
                                            setDeleteConfirm(null);
                                          }}>Yes</button>
                                          <button className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-white hover:bg-gray-500" onClick={() => setDeleteConfirm(null)}>No</button>
                                        </>
                                      ) : (
                                        <button className="!min-w-0 !min-h-0 w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 leading-none shrink-0" onClick={() => setDeleteConfirm({ section: 'material', taskIdx: idx, subIdx: mIdx })}>−</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Task total footer */}
                        <div className="px-4 py-3 border-t border-gray-600/50 flex justify-end">
                          <span className="bg-green-900/40 text-green-400 font-bold text-sm px-3 py-1 rounded-lg">
                            Total: £{materialsTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ===== MINOR TASKS ===== */}
              {(editInvoice.minor_tasks || []).length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('common:minor_tasks_label')}</span>
                    <div className="flex-1 h-px bg-gray-600" />
                  </div>

                  {/* Column headers */}
                  <div className="hidden md:grid md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 mb-1 px-1">
                    <span className="text-[10px] text-gray-500 uppercase">Name</span>
                    <span className="text-[10px] text-gray-500 uppercase">Quantity</span>
                    <span className="text-[10px] text-gray-500 uppercase">Unit</span>
                    <span className="text-[10px] text-gray-500 uppercase">Price/unit</span>
                    <span className="text-[10px] text-gray-500 uppercase text-right">Total</span>
                  </div>

                  <div className="space-y-2">
                    {(editInvoice.minor_tasks || []).map((task: any, idx: number) => {
                      const total = (Number(task.quantity) * Number(task.pricePerUnit) || 0).toFixed(2);
                      return (
                        <div key={idx} className="border border-gray-600/50 rounded-lg p-3" style={{ backgroundColor: 'rgba(55, 65, 81, 0.3)' }}>
                          <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 items-center">
                            <div className="col-span-2 md:col-span-1">
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Name</label>
                              <input
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={task.name}
                                onChange={e => {
                                  const updated = [...editInvoice.minor_tasks];
                                  updated[idx].name = e.target.value;
                                  setEditInvoice({ ...editInvoice, minor_tasks: updated });
                                }}
                                placeholder={t('calculator:task_name_placeholder')}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Qty</label>
                              <input
                                type="number"
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={task.quantity}
                                onChange={e => {
                                  const updated = [...editInvoice.minor_tasks];
                                  updated[idx].quantity = Number(e.target.value);
                                  setEditInvoice({ ...editInvoice, minor_tasks: updated });
                                }}
                                placeholder={t('calculator:quantity_placeholder')}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Unit</label>
                              <input
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={task.unit}
                                onChange={e => {
                                  const updated = [...editInvoice.minor_tasks];
                                  updated[idx].unit = e.target.value;
                                  setEditInvoice({ ...editInvoice, minor_tasks: updated });
                                }}
                                placeholder={t('calculator:unit_placeholder')}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Price/unit</label>
                              <input
                                type="number"
                                step="0.01"
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={task.pricePerUnit !== undefined && task.pricePerUnit !== null ? task.pricePerUnit : ''}
                                onChange={e => {
                                  const updated = [...editInvoice.minor_tasks];
                                  updated[idx].pricePerUnit = Number(e.target.value);
                                  setEditInvoice({ ...editInvoice, minor_tasks: updated });
                                }}
                                placeholder={t('calculator:price_per_unit_placeholder')}
                              />
                            </div>
                            <div className="flex items-center justify-end gap-1 min-w-[100px]">
                              <span className="text-green-400 font-semibold text-sm">£{total}</span>
                              {deleteConfirm?.section === 'minor_task' && deleteConfirm.taskIdx === idx ? (
                                <>
                                  <button className="text-xs bg-red-600 px-1.5 py-0.5 rounded text-white hover:bg-red-700" onClick={() => {
                                    const updated = editInvoice.minor_tasks.filter((_: any, i: number) => i !== idx);
                                    setEditInvoice({ ...editInvoice, minor_tasks: updated });
                                    setDeleteConfirm(null);
                                  }}>Yes</button>
                                  <button className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-white hover:bg-gray-500" onClick={() => setDeleteConfirm(null)}>No</button>
                                </>
                              ) : (
                                <button className="!min-w-0 !min-h-0 w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 leading-none shrink-0" onClick={() => setDeleteConfirm({ section: 'minor_task', taskIdx: idx })}>−</button>
                              )}
                            </div>
                          </div>
                          {/* Description */}
                          <textarea
                            className="!w-full !bg-transparent !border-none !text-gray-400 !text-xs !p-0 !mt-2 !shadow-none !ring-0 focus:!ring-0 !resize-none placeholder-gray-600"
                            value={task.description || ''}
                            onChange={e => {
                              const updated = [...editInvoice.minor_tasks];
                              updated[idx].description = e.target.value;
                              setEditInvoice({ ...editInvoice, minor_tasks: updated });
                            }}
                            placeholder={t('calculator:task_description_placeholder')}
                            rows={1}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== EXTRA MATERIALS ===== */}
              {(editInvoice.extra_materials || []).length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('common:extra_materials_label')}</span>
                    <div className="flex-1 h-px bg-gray-600" />
                  </div>

                  {/* Column headers */}
                  <div className="hidden md:grid md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 mb-1 px-1">
                    <span className="text-[10px] text-gray-500 uppercase">Name</span>
                    <span className="text-[10px] text-gray-500 uppercase">Quantity</span>
                    <span className="text-[10px] text-gray-500 uppercase">Unit</span>
                    <span className="text-[10px] text-gray-500 uppercase">Price/unit</span>
                    <span className="text-[10px] text-gray-500 uppercase text-right">Total</span>
                  </div>

                  <div className="space-y-2">
                    {(editInvoice.extra_materials || []).map((mat: any, idx: number) => {
                      const total = (Number(mat.quantity) * Number(mat.pricePerUnit) || 0).toFixed(2);
                      return (
                        <div key={idx} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_80px_1fr_auto] gap-2 items-center p-2 rounded-lg" style={{ backgroundColor: 'rgba(55, 65, 81, 0.3)' }}>
                          <div className="col-span-2 md:col-span-1">
                            <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Name</label>
                            <input
                              className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                              value={mat.name}
                              onChange={e => {
                                const updated = [...editInvoice.extra_materials];
                                updated[idx].name = e.target.value;
                                setEditInvoice({ ...editInvoice, extra_materials: updated });
                              }}
                              placeholder={t('calculator:material_name_placeholder')}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Qty</label>
                            <input
                              type="number"
                              className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                              value={mat.quantity}
                              onChange={e => {
                                const updated = [...editInvoice.extra_materials];
                                updated[idx].quantity = Number(e.target.value);
                                setEditInvoice({ ...editInvoice, extra_materials: updated });
                              }}
                              placeholder={t('calculator:quantity_placeholder')}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Unit</label>
                            <input
                              className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                              value={mat.unit}
                              onChange={e => {
                                const updated = [...editInvoice.extra_materials];
                                updated[idx].unit = e.target.value;
                                setEditInvoice({ ...editInvoice, extra_materials: updated });
                              }}
                              placeholder={t('calculator:unit_placeholder')}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Price/unit</label>
                            <input
                              type="number"
                              step="0.01"
                              className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                              value={mat.pricePerUnit !== undefined && mat.pricePerUnit !== null ? mat.pricePerUnit : ''}
                              onChange={e => {
                                const updated = [...editInvoice.extra_materials];
                                updated[idx].pricePerUnit = Number(e.target.value);
                                setEditInvoice({ ...editInvoice, extra_materials: updated });
                              }}
                              placeholder={t('calculator:price_per_unit_placeholder')}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1 min-w-[100px]">
                            <span className="text-green-400 font-semibold text-sm">£{total}</span>
                            {deleteConfirm?.section === 'extra_material' && deleteConfirm.taskIdx === idx ? (
                              <>
                                <button className="text-xs bg-red-600 px-1.5 py-0.5 rounded text-white hover:bg-red-700" onClick={() => {
                                  const updated = editInvoice.extra_materials.filter((_: any, i: number) => i !== idx);
                                  setEditInvoice({ ...editInvoice, extra_materials: updated });
                                  setDeleteConfirm(null);
                                }}>Yes</button>
                                <button className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-white hover:bg-gray-500" onClick={() => setDeleteConfirm(null)}>No</button>
                              </>
                            ) : (
                              <button className="!min-w-0 !min-h-0 w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 leading-none shrink-0" onClick={() => setDeleteConfirm({ section: 'extra_material', taskIdx: idx })}>−</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== ADDITIONAL COSTS in edit mode ===== */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('common:additional_costs_label')}</span>
                  <div className="flex-1 h-px bg-gray-600" />
                </div>

                {additionalCosts.length > 0 && (
                  <>
                    <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_auto] gap-2 mb-1 px-1">
                      <span className="text-[10px] text-gray-500 uppercase">Name</span>
                      <span className="text-[10px] text-gray-500 uppercase">Quantity</span>
                      <span className="text-[10px] text-gray-500 uppercase">Price/unit</span>
                      <span className="text-[10px] text-gray-500 uppercase text-right">Total</span>
                    </div>
                    <div className="space-y-2">
                      {additionalCosts.map((cost, idx) => {
                        const total = (cost.pricePerUnit * cost.quantity).toFixed(2);
                        return (
                          <div key={idx} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center p-2 rounded-lg" style={{ backgroundColor: 'rgba(55, 65, 81, 0.3)' }}>
                            <div className="col-span-2 md:col-span-1">
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Name</label>
                              <input
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={cost.name}
                                onChange={e => {
                                  const updated = [...additionalCosts];
                                  updated[idx].name = e.target.value;
                                  setAdditionalCosts(updated);
                                }}
                                placeholder={t('common:cost_name_placeholder')}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Quantity</label>
                              <input
                                type="number"
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={cost.quantity}
                                onChange={e => {
                                  const updated = [...additionalCosts];
                                  updated[idx].quantity = Number(e.target.value);
                                  setAdditionalCosts(updated);
                                }}
                                placeholder={t('calculator:quantity_placeholder')}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 uppercase md:hidden mb-0.5 block">Price/unit</label>
                              <input
                                type="number"
                                step="0.01"
                                className="!rounded-lg !px-3 !py-2 !bg-gray-800 !border-gray-600 !text-white !text-sm w-full"
                                value={cost.pricePerUnit !== undefined ? cost.pricePerUnit : ''}
                                onChange={e => {
                                  const updated = [...additionalCosts];
                                  updated[idx].pricePerUnit = Number(e.target.value);
                                  setAdditionalCosts(updated);
                                }}
                                placeholder={t('common:price_per_unit_placeholder')}
                              />
                            </div>
                            <div className="flex items-center justify-end gap-1 min-w-[100px]">
                              <span className="text-green-400 font-semibold text-sm">£{total}</span>
                              {deleteConfirm?.section === 'additional_cost' && deleteConfirm.taskIdx === idx ? (
                                <>
                                  <button className="text-xs bg-red-600 px-1.5 py-0.5 rounded text-white hover:bg-red-700" onClick={() => {
                                    setAdditionalCosts(additionalCosts.filter((_, i) => i !== idx));
                                    setDeleteConfirm(null);
                                  }}>Yes</button>
                                  <button className="text-xs bg-gray-600 px-1.5 py-0.5 rounded text-white hover:bg-gray-500" onClick={() => setDeleteConfirm(null)}>No</button>
                                </>
                              ) : (
                                <button className="!min-w-0 !min-h-0 w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 leading-none shrink-0" onClick={() => setDeleteConfirm({ section: 'additional_cost', taskIdx: idx })}>−</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {additionalCosts.length === 0 && (
                  <p className="text-gray-500 text-sm italic">No additional costs added.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkPricingModal;
