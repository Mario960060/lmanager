import React, { useEffect, useState } from 'react';
// You can use jsPDF or @react-pdf/renderer for PDF export
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';

interface InvoiceMakerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WorkPricingModal: React.FC<InvoiceMakerModalProps> = ({ isOpen, onClose }) => {
  const companyId = useAuthStore(state => state.getCompanyId());
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [invoice, setInvoice] = useState<any>(null);
  const [editMode, setEditMode] = useState<boolean>(false);
  const [editInvoice, setEditInvoice] = useState<any>(null);
  const [showPrices, setShowPrices] = useState<'all' | 'none' | 'totals'>('all');
  const [showHours, setShowHours] = useState<'all' | 'none'>('all');
  const [additionalCosts, setAdditionalCosts] = useState<{ name: string; pricePerUnit: number; quantity: number }[]>([]);

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

  const handleDownloadPDF = () => {
    if (!invoice) return;
    const doc = new jsPDF();
    const PAGE_HEIGHT = 297; // A4 in mm
    const BOTTOM_MARGIN = 20;

    let y = 10;

    function checkAddPage(doc: any, y: number) {
      if (y > PAGE_HEIGHT - BOTTOM_MARGIN) {
        doc.addPage();
        return 10; // reset y to top margin
      }
      return y;
    }

    doc.setFontSize(14);
    doc.text(`Invoice for Project: ${selectedProjectId}`, 10, y);
    y += 10;
    y = checkAddPage(doc, y);

    doc.setFontSize(12);
    doc.text('Work Pricing Preview', 10, y);
    y += 8;
    y = checkAddPage(doc, y);

    // Main Tasks
    doc.setFont(undefined, 'bold');
    doc.text('Main tasks summary:', 10, y);
    y += 8;
    y = checkAddPage(doc, y);
    doc.setFont(undefined, 'normal');

    (invoice.main_tasks || []).forEach((task: any, idx: number) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${task.name}`, 12, y);
      y += 7;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'normal');

      // Main Task Description
      if (task.description) {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`${task.description}`, 14, y);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        y += 6;
        y = checkAddPage(doc, y);
      }

      // Task Breakdown
      if (task.results?.taskBreakdown && task.results.taskBreakdown.length > 0) {
        doc.text('Tasks breakdown:', 14, y);
        y += 6;
        y = checkAddPage(doc, y);
        (task.results.taskBreakdown || []).forEach((breakdown: any) => {
          // Calculate price for this breakdown (hours * pricePerHour)
          const hours = Number(breakdown.hours) || 0;
          const pricePerHour = Number(breakdown.pricePerHour) || 0;
          const breakdownPrice = (hours * pricePerHour).toFixed(2);

          let breakdownLine = `- ${breakdown.name || breakdown.task} — `;
          breakdownLine +=
            typeof breakdown.amount === 'number'
              ? ` ${Number.isInteger(breakdown.amount) ? breakdown.amount : breakdown.amount.toFixed(1)}`
              : ` ${breakdown.amount}`;
          breakdownLine += ` ${breakdown.unit} — `;
          breakdownLine +=
            typeof breakdown.hours === 'number'
              ? ` ${Number(breakdown.hours).toFixed(2)}`
              : ` ${breakdown.hours}`;
          breakdownLine += ' hrs';
          if (typeof breakdown.pricePerHour === 'number' && !isNaN(breakdown.pricePerHour)) {
            breakdownLine += ` — £${breakdownPrice}`;
          }

          doc.text(breakdownLine, 16, y);
          y += 6;
          y = checkAddPage(doc, y);
        });
      }

      // Materials
      if (task.results?.materials && task.results.materials.length > 0) {
        doc.text('Material required:', 14, y);
        y += 6;
        y = checkAddPage(doc, y);
        (task.results.materials || []).forEach((mat: any) => {
          const roundedQty = Math.ceil(Number(mat.quantity) || 0);
          doc.text(
            `${mat.name} — ${roundedQty} ${mat.unit || ''} — £${(roundedQty * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £${Number(mat.pricePerUnit).toFixed(2)} per unit )`,
            16,
            y
          );
          y += 6;
          y = checkAddPage(doc, y);
        });
        // Total task price
        const materialsTotal = (task.results.materials || []).reduce(
          (sum: number, mat: any) => sum + (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0),
          0
        );
        doc.setTextColor(0, 128, 0);
        doc.text(`Total task price: £${materialsTotal.toFixed(2)}`, 16, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
        y = checkAddPage(doc, y);
      }

      // Thicker line between main tasks
      if (idx < (invoice.main_tasks.length - 1)) {
        doc.setDrawColor(128, 128, 128);
        doc.setLineWidth(1);
        doc.line(10, y, 200, y);
        y += 6;
        y = checkAddPage(doc, y);
      }
    });

    // Minor Tasks
    if (invoice.minor_tasks && invoice.minor_tasks.length > 0) {
      y += 4;
      y = checkAddPage(doc, y);
      doc.setDrawColor(128, 128, 128);
      doc.setLineWidth(1);
      doc.line(10, y, 200, y);
      y += 6;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'bold');
      doc.text('Minor tasks summary:', 10, y);
      y += 8;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'normal');
      (invoice.minor_tasks || []).forEach((task: any) => {
        let minorLine =
          `${task.name} (` +
          (typeof task.quantity === 'number'
            ? Number.isInteger(task.quantity)
              ? task.quantity
              : task.quantity.toFixed(1)
            : task.quantity) +
          ` ${task.unit}) — £${(Number(task.quantity) * Number(task.pricePerUnit) || 0).toFixed(2)} ( £${Number(task.pricePerUnit).toFixed(2)} per unit )`;
        doc.text(minorLine, 12, y);
        y += 6;
        y = checkAddPage(doc, y);

        // Minor Task Description
        if (task.description) {
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text(`${task.description}`, 16, y);
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(12);
          y += 5;
          y = checkAddPage(doc, y);
        }
      });
      const minorTotal = (invoice.minor_tasks || []).reduce(
        (sum: number, task: any) =>
          sum +
          (typeof task.quantity === 'number' && typeof task.pricePerUnit === 'number'
            ? task.quantity * task.pricePerUnit
            : 0),
        0
      );
      doc.setTextColor(0, 128, 0);
      doc.text(`Total minor tasks price: £${minorTotal.toFixed(2)}`, 12, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
      y = checkAddPage(doc, y);
    }

    // Extra Materials
    if (invoice.extra_materials && invoice.extra_materials.length > 0) {
      y += 4;
      y = checkAddPage(doc, y);
      doc.setDrawColor(128, 128, 128);
      doc.setLineWidth(1);
      doc.line(10, y, 200, y);
      y += 6;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'bold');
      doc.text('Extra materials:', 10, y);
      y += 8;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'normal');
      (invoice.extra_materials || []).forEach((mat: any) => {
        doc.text(
          `${mat.name} —` +
            (typeof mat.quantity === 'number'
              ? ` ${Number.isInteger(mat.quantity) ? mat.quantity : mat.quantity.toFixed(1)}`
              : ` ${mat.quantity}`) +
            ` ${mat.unit || ''} — ` +
            `£${(Number(mat.quantity) * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £${Number(mat.pricePerUnit).toFixed(2)} per unit )`,
          12,
          y
        );
        y += 6;
        y = checkAddPage(doc, y);
      });
      const extraTotal = (invoice.extra_materials || []).reduce(
        (sum: number, mat: any) => sum + (Number(mat.quantity) * Number(mat.pricePerUnit) || 0),
        0
      );
      doc.setTextColor(0, 128, 0);
      doc.text(`Total extra materials price: £${extraTotal.toFixed(2)}`, 12, y);
      doc.setTextColor(0, 0, 0);
      y += 8;
      y = checkAddPage(doc, y);
    }

    // Additional Costs Section
    if (invoice.totals) {
      y += 4;
      y = checkAddPage(doc, y);
      doc.setDrawColor(128, 128, 128);
      doc.setLineWidth(0.5);
      doc.line(10, y, 200, y);
      y += 6;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'bold');
      doc.text('Additional Costs', 10, y);
      y += 8;
      y = checkAddPage(doc, y);
      doc.setFont(undefined, 'normal');
      if (invoice.totals.totalHours) {
        doc.text(`Total hours needed: ${Math.ceil(invoice.totals.totalHours)} hrs`, 12, y);
        y += 6;
        y = checkAddPage(doc, y);
      }
      // All materials summed up (optional)
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

      // Calculate grand total
      const mainTasksTotal = mainTasksWithTotal.reduce((sum, t) => sum + t.totalPrice, 0);
      const minorTasksTotal = minorTasksWithTotal.reduce((sum, t) => sum + t.totalPrice, 0);
      const materialsTotal = allMaterials.reduce((sum, m) => sum + (m.totalPrice || 0), 0);
      const additionalCostsTotal = additionalCosts.reduce((sum, c) => sum + c.pricePerUnit * c.quantity, 0);
      const grandTotal = mainTasksTotal + minorTasksTotal + materialsTotal + additionalCostsTotal;

      return (
        <div>
          {/* Main tasks with only total price */}
          <div className="font-medium mb-1">Main tasks total prices:</div>
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
              <div className="font-medium mt-4 mb-1">Minor tasks total prices:</div>
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
              <div className="font-medium mt-4 mb-1">All materials required:</div>
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
              <div className="font-medium mt-4 mb-1">Additional costs:</div>
              <ul className="ml-6 mb-2">
                {additionalCosts.map((cost, idx) => (
                  <li key={idx}>
                    {cost.name || <span className="italic text-gray-400">Unnamed</span>} — {cost.quantity} × £{cost.pricePerUnit.toFixed(2)} = <span className="font-semibold text-green-400">£{(cost.pricePerUnit * cost.quantity).toFixed(2)}</span>
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
            Total costs: <span className="text-green-500">£{grandTotal.toFixed(2)}</span>
          </div>
        </div>
      );
    }

    doc.save(`invoice_${selectedProjectId}.pdf`);
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
      alert('Failed to save changes!');
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
        <h2 className="text-xl md:text-2xl font-bold mb-4">Work Pricing</h2>
        <div className="flex flex-col md:flex-row gap-3 md:gap-6 mb-4">
          <div className="w-full md:w-auto">
            <label className="font-semibold mr-2 block md:inline">Show prices:</label>
            <select
              className="border rounded p-1 w-full md:w-auto mt-1 md:mt-0"
              value={showPrices}
              onChange={e => setShowPrices(e.target.value as 'all' | 'none' | 'totals')}
            >
              <option value="all">All</option>
              <option value="totals">Show only total prices</option>
              <option value="none">Don't show at all</option>
            </select>
          </div>
          <div className="w-full md:w-auto">
            <label className="font-semibold mr-2 block md:inline">Show hrs needed:</label>
            <select
              className="border rounded p-1 w-full md:w-auto mt-1 md:mt-0"
              value={showHours}
              onChange={e => setShowHours(e.target.value as 'all' | 'none')}
            >
              <option value="all">All</option>
              <option value="none">Don't show at all</option>
            </select>
          </div>
        </div>
        <select
          className="block w-full mb-6 border rounded p-2"
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
        >
          <option value="">Select a project</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        {selectedProjectId && invoice ? (
          <div className="flex-1 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Work Pricing Preview</h3>
            {/* Main Tasks Summary */}
            <div className="mb-6">
              <div className="font-bold text-lg mb-2">Main tasks summary:</div>
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
                        <div className="font-medium">Tasks breakdown:</div>
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
                                    } hrs
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
                        <div className="font-medium">Material required:</div>
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
                                    £{(roundedQty * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £{Number(mat.pricePerUnit).toFixed(2)} per unit )
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {/* Show total price if showPrices is 'all' or 'totals' */}
                        {(showPrices === 'all' || showPrices === 'totals') && (
                          <div className="ml-2 mt-1 font-semibold text-green-300">
                            Total task price: £{
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
                <div className="font-bold text-lg mb-2">Minor tasks summary:</div>
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
                              £{(Number(task.quantity) * Number(task.pricePerUnit) || 0).toFixed(2)} ( £{Number(task.pricePerUnit).toFixed(2)} per unit )
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
                    Total minor tasks price: £{
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
                <div className="font-bold text-lg mb-2">Extra materials:</div>
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
                            £{(roundedQty * Number(mat.pricePerUnit) || 0).toFixed(2)} ( £{Number(mat.pricePerUnit).toFixed(2)} per unit )
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {showPrices === 'all' || showPrices === 'totals' && (
                  <div className="ml-4 mt-1 font-semibold text-green-300">
                    Total extra materials price: £{
                      (invoice.extra_materials || []).reduce(
                        (sum: number, mat: any) => sum + (Math.ceil(Number(mat.quantity) || 0) * Number(mat.pricePerUnit) || 0),
                        0
                      ).toFixed(2)
                    }
                  </div>
                )}
              </>
            )}

            {/* Additional Costs Section */}
            <div className="mt-8 mb-8">
              <div className="font-bold text-lg mb-2">Additional Costs</div>
              <ul className="mb-4">
                {additionalCosts.map((cost, idx) => (
                  <li key={idx} className="flex items-center gap-2 mb-2">
                    <div className="flex flex-col">
                      <input
                        className="border p-1 w-48 bg-gray-800 text-white"
                        value={cost.name}
                        onChange={e => {
                          const updated = [...additionalCosts];
                          updated[idx].name = e.target.value;
                          setAdditionalCosts(updated);
                        }}
                        placeholder="Cost name"
                      />
                      <span className="text-xs text-gray-400 ml-1">Name</span>
                    </div>
                    <div className="flex flex-col">
                      <input
                        type="number"
                        className="border p-1 w-24"
                        value={cost.pricePerUnit}
                        onChange={e => {
                          const updated = [...additionalCosts];
                          updated[idx].pricePerUnit = Number(e.target.value);
                          setAdditionalCosts(updated);
                        }}
                        placeholder="Price per unit"
                      />
                      <span className="text-xs text-gray-400 ml-1">Price per unit (£)</span>
                    </div>
                    <div className="flex flex-col">
                      <input
                        type="number"
                        className="border p-1 w-20"
                        value={cost.quantity}
                        onChange={e => {
                          const updated = [...additionalCosts];
                          updated[idx].quantity = Number(e.target.value);
                          setAdditionalCosts(updated);
                        }}
                        placeholder="Quantity"
                      />
                      <span className="text-xs text-gray-400 ml-1">Amount</span>
                    </div>
                    <span className="font-semibold text-green-500 ml-2">
                      £{(cost.pricePerUnit * cost.quantity).toFixed(2)}
                    </span>
                    <button
                      className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700"
                      onClick={() => {
                        setAdditionalCosts(additionalCosts.filter((_, i) => i !== idx));
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-700"
                onClick={() => setAdditionalCosts([...additionalCosts, { name: '', pricePerUnit: 0, quantity: 1 }])}
              >
                Add Additional Cost
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
              <div className="font-bold text-lg mb-2">In total:</div>
              {/* Total hours */}
              {showHours === 'all' && invoice.totals.totalHours && (
                <div className="mb-2">
                  <span className="font-medium">Total hours needed:</span> {Math.ceil(invoice.totals.totalHours)} hrs
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
                    <div className="font-medium mb-1">Main tasks total prices:</div>
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
                        <div className="font-medium mt-4 mb-1">Minor tasks total prices:</div>
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
                        <div className="font-medium mt-4 mb-1">All materials required:</div>
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
                        <div className="font-medium mt-4 mb-1">Additional costs:</div>
                        <ul className="ml-6 mb-2">
                          {additionalCosts.map((cost, idx) => (
                            <li key={idx}>
                              {cost.name || <span className="italic text-gray-400">Unnamed</span>} — {cost.quantity} × £{cost.pricePerUnit.toFixed(2)} = <span className="font-semibold text-green-400">£{(cost.pricePerUnit * cost.quantity).toFixed(2)}</span>
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
                      Total costs: <span className="text-green-500">£{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : selectedProjectId ? (
          <div className="text-gray-500">No work pricing found for this project.</div>
        ) : (
          <div className="text-gray-500">Please select a project to preview the work pricing.</div>
        )}
        <div className="flex gap-2 mt-6">
          <button
            className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm"
            onClick={handleDownloadPDF}
            disabled={!invoice}
          >
            Download PDF
          </button>
          <button
            className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 text-sm"
            onClick={() => {
              setEditInvoice(JSON.parse(JSON.stringify(invoice)));
              setEditMode(true);
            }}
            disabled={!invoice}
          >
            Edit
          </button>
        </div>
      </div>
      {editMode && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setEditMode(false)}
        >
          <div
            className="bg-gray-800 p-4 md:p-6 rounded-lg w-full relative overflow-y-auto"
            style={{ 
              maxHeight: '95vh',
              minHeight: '80vh',
              width: '100%',
              maxWidth: '1100px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 bg-gray-700 text-white text-3xl font-bold rounded-full w-10 h-10 md:w-12 md:h-12 flex items-center justify-center shadow-lg hover:bg-gray-600 transition"
              style={{ zIndex: 10 }}
              onClick={() => setEditMode(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-4 text-white">Edit Work Pricing</h2>
            {/* Editable Main Tasks */}
            <div>
              <div className="font-bold mb-2 text-gray-200">Main Tasks</div>
              {(editInvoice.main_tasks || []).map((task: any, idx: number) => {
                const materialsTotal = (task.results?.materials || []).reduce(
                  (sum: number, mat: any) => sum + (Number(mat.quantity) * Number(mat.pricePerUnit) || 0),
                  0
                );
                return (
                  <div key={idx} className="mb-4 border border-gray-600 rounded bg-gray-700 p-2">
                    {/* Task Name */}
                    <input
                      className="border p-1 mb-1 w-full bg-gray-700 text-white font-semibold"
                      value={task.name}
                      onChange={e => {
                        const updated = [...editInvoice.main_tasks];
                        updated[idx].name = e.target.value;
                        setEditInvoice({ ...editInvoice, main_tasks: updated });
                      }}
                      placeholder="Task name"
                    />
                    {/* Task Description */}
                    <textarea
                      className="border p-1 mb-2 w-full bg-gray-700 text-gray-200 text-sm"
                      value={task.description || ''}
                      onChange={e => {
                        const updated = [...editInvoice.main_tasks];
                        updated[idx].description = e.target.value;
                        setEditInvoice({ ...editInvoice, main_tasks: updated });
                      }}
                      placeholder="Task description"
                      rows={2}
                    />
                    {/* Task Breakdown */}
                    <div className="ml-2 mt-1">
                      <div className="text-gray-300 text-sm mb-1">Breakdown:</div>
                      {(task.results?.taskBreakdown || []).map((breakdown: any, bIdx: number) => {
                        // Extract number and unit if amount is a string like "20 square meters"
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

                        // Calculate price for this breakdown (hours * pricePerHour)
                        const hours = Number(breakdown.hours) || 0;
                        const pricePerHour = Number(breakdown.pricePerHour) || 0;
                        const breakdownPrice = (hours * pricePerHour).toFixed(2);

                        return (
                          <div key={bIdx} className="flex gap-2 mb-1 items-center">
                            <input
                              className="border p-1 w-32 bg-gray-800 text-white"
                              value={breakdown.name || breakdown.task || breakdown.title || ''}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.taskBreakdown[bIdx].name = e.target.value;
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Breakdown name"
                            />
                            <input
                              type="number"
                              className="border p-1 w-20 bg-gray-800 text-white"
                              value={amountValue}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.taskBreakdown[bIdx].amount = Number(e.target.value);
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Amount"
                            />
                            <input
                              className="border p-1 w-16 bg-gray-800 text-white"
                              value={unitValue}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.taskBreakdown[bIdx].unit = e.target.value;
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Unit"
                            />
                            <input
                              type="number"
                              step="0.01"
                              className="border p-1 w-20 bg-gray-800 text-white"
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
                              placeholder="Hours"
                            />
                            <input
                              type="number"
                              step="0.01"
                              className="border p-1 w-24 bg-gray-800 text-white"
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
                              placeholder="Price/hr"
                            />
                            <span className="text-green-200 ml-2">
                              £{breakdownPrice}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Materials */}
                    <div className="ml-2 mt-2">
                      <div className="text-gray-300 text-sm mb-1">Materials:</div>
                      {(task.results?.materials || []).map((mat: any, mIdx: number) => {
                        const total = (Number(mat.quantity) * Number(mat.pricePerUnit) || 0).toFixed(2);
                        return (
                          <div key={mIdx} className="flex gap-2 mb-1 items-center">
                            <input
                              className="border p-1 w-32 bg-gray-800 text-white"
                              value={mat.name}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.materials[mIdx].name = e.target.value;
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Material name"
                            />
                            <input
                              type="number"
                              className="border p-1 w-20 bg-gray-800 text-white"
                              value={mat.quantity ?? ''}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.materials[mIdx].quantity = Number(e.target.value);
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Quantity"
                            />
                            <input
                              className="border p-1 w-16 bg-gray-800 text-white"
                              value={mat.unit}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.materials[mIdx].unit = e.target.value;
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Unit"
                            />
                            <input
                              type="number"
                              step="0.01"
                              className="border p-1 w-20 bg-gray-800 text-white"
                              value={mat.pricePerUnit !== undefined && mat.pricePerUnit !== null ? mat.pricePerUnit : ''}
                              onChange={e => {
                                const updated = [...editInvoice.main_tasks];
                                updated[idx].results.materials[mIdx].pricePerUnit = Number(e.target.value);
                                setEditInvoice({ ...editInvoice, main_tasks: updated });
                              }}
                              placeholder="Price per unit"
                            />
                            <span className="text-green-200 ml-2">
                              £{total} ( £{Number(mat.pricePerUnit).toFixed(2)} per unit )
                            </span>
                          </div>
                        );
                      })}
                      <div className="ml-2 mt-1 font-semibold text-green-400 text-right" style={{ fontSize: '1.1em' }}>
                        Total task price: £{materialsTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Editable Minor Tasks */}
            <div className="mt-6">
              <div className="font-bold mb-2 text-gray-200">Minor Tasks</div>
              {(editInvoice.minor_tasks || []).map((task: any, idx: number) => {
                const total = (Number(task.quantity) * Number(task.pricePerUnit) || 0).toFixed(2);
                return (
                  <div key={idx} className="flex flex-col gap-1 mb-2">
                    <div className="flex gap-2 items-center">
                      <input
                        className="border p-1 w-40 bg-gray-700 text-white"
                        value={task.name}
                        onChange={e => {
                          const updated = [...editInvoice.minor_tasks];
                          updated[idx].name = e.target.value;
                          setEditInvoice({ ...editInvoice, minor_tasks: updated });
                        }}
                        placeholder="Task name"
                      />
                      <input
                        type="number"
                        className="border p-1 w-20 bg-gray-700 text-white"
                        value={task.quantity}
                        onChange={e => {
                          const updated = [...editInvoice.minor_tasks];
                          updated[idx].quantity = Number(e.target.value);
                          setEditInvoice({ ...editInvoice, minor_tasks: updated });
                        }}
                        placeholder="Quantity"
                      />
                      <input
                        className="border p-1 w-16 bg-gray-700 text-white"
                        value={task.unit}
                        onChange={e => {
                          const updated = [...editInvoice.minor_tasks];
                          updated[idx].unit = e.target.value;
                          setEditInvoice({ ...editInvoice, minor_tasks: updated });
                        }}
                        placeholder="Unit"
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="border p-1 w-24 bg-gray-700 text-white"
                        value={task.pricePerUnit !== undefined && task.pricePerUnit !== null ? task.pricePerUnit : ''}
                        onChange={e => {
                          const updated = [...editInvoice.minor_tasks];
                          updated[idx].pricePerUnit = Number(e.target.value);
                          setEditInvoice({ ...editInvoice, minor_tasks: updated });
                        }}
                        placeholder="Price per unit"
                      />
                      <span className="text-green-200 ml-2">
                        £{total} ( £{Number(task.pricePerUnit).toFixed(2)} per unit )
                      </span>
                    </div>
                    {/* Minor Task Description */}
                    <textarea
                      className="border p-1 w-full bg-gray-700 text-gray-200 text-xs"
                      value={task.description || ''}
                      onChange={e => {
                        const updated = [...editInvoice.minor_tasks];
                        updated[idx].description = e.target.value;
                        setEditInvoice({ ...editInvoice, minor_tasks: updated });
                      }}
                      placeholder="Task description"
                      rows={1}
                    />
                  </div>
                );
              })}
            </div>
            {/* Editable Extra Materials */}
            <div className="mt-6">
              <div className="font-bold mb-2 text-gray-200">Extra Materials</div>
              {(editInvoice.extra_materials || []).map((mat: any, idx: number) => {
                const total = (Number(mat.quantity) * Number(mat.pricePerUnit) || 0).toFixed(2);
                return (
                  <div key={idx} className="flex gap-2 mb-1 items-center">
                    <input
                      className="border p-1 w-40 bg-gray-700 text-white"
                      value={mat.name}
                      onChange={e => {
                        const updated = [...editInvoice.extra_materials];
                        updated[idx].name = e.target.value;
                        setEditInvoice({ ...editInvoice, extra_materials: updated });
                      }}
                      placeholder="Material name"
                    />
                    <input
                      type="number"
                      className="border p-1 w-20 bg-gray-700 text-white"
                      value={mat.quantity}
                      onChange={e => {
                        const updated = [...editInvoice.extra_materials];
                        updated[idx].quantity = Number(e.target.value);
                        setEditInvoice({ ...editInvoice, extra_materials: updated });
                      }}
                      placeholder="Quantity"
                    />
                    <input
                      className="border p-1 w-16 bg-gray-700 text-white"
                      value={mat.unit}
                      onChange={e => {
                        const updated = [...editInvoice.extra_materials];
                        updated[idx].unit = e.target.value;
                        setEditInvoice({ ...editInvoice, extra_materials: updated });
                      }}
                      placeholder="Unit"
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="border p-1 w-20 bg-gray-700 text-white"
                      value={mat.pricePerUnit !== undefined && mat.pricePerUnit !== null ? mat.pricePerUnit : ''}
                      onChange={e => {
                        const updated = [...editInvoice.extra_materials];
                        updated[idx].pricePerUnit = Number(e.target.value);
                        setEditInvoice({ ...editInvoice, extra_materials: updated });
                      }}
                      placeholder="Price per unit"
                    />
                    <span className="text-green-200 ml-2">
                      £{total} ( £{Number(mat.pricePerUnit).toFixed(2)} per unit )
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm"
                onClick={handleSaveInvoice}
              >
                Save
              </button>
              <button
                className="bg-gray-400 text-white px-3 py-2 rounded hover:bg-gray-500 text-sm"
                onClick={() => setEditMode(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkPricingModal;
