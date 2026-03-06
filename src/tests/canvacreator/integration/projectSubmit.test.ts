import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitProject } from "../../../projectmanagement/canvacreator/projectSubmit";
import { Shape } from "../../../projectmanagement/canvacreator/geometry";
import { ProjectSettings } from "../../../projectmanagement/canvacreator/types";
import { toPixels } from "../../../projectmanagement/canvacreator/geometry";

function makeShapeWithResults(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [
      { x: 0, y: 0 },
      { x: toPixels(2), y: 0 },
      { x: toPixels(2), y: toPixels(2) },
      { x: 0, y: toPixels(2) },
    ],
    closed: true,
    label: "Test Slab",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [0, 0, 0, 0],
    elementType: "polygon",
    thickness: 0,
    calculatorType: "slab",
    calculatorResults: {
      name: "Slab",
      amount: 4,
      unit: "m²",
      hours_worked: 2,
      materials: [{ name: "Sand", quantity: 0.5, unit: "m³" }],
      taskBreakdown: [{ task: "Excavation", hours: 1, amount: 4, unit: "m²" }],
    },
    ...overrides,
  };
}

describe("submitProject", () => {
  const baseSettings: ProjectSettings = {
    title: "Test Project",
    description: "",
    startDate: "2025-03-01",
    endDate: "2025-03-15",
    status: "planned",
    selectedExcavator: null,
    selectedCarrier: null,
    selectedMaterialCarrier: null,
    selectedCompactor: null,
    calculateTransport: false,
    transportDistance: "30",
  };

  it("throws when companyId is missing", async () => {
    const supabase = { from: () => ({}) } as any;
    await expect(
      submitProject({
        shapes: [makeShapeWithResults()],
        projectSettings: baseSettings,
        supabase: supabase as any,
        companyId: "",
        userId: "user-1",
      })
    ).rejects.toThrow("No company_id available");
  });

  it("throws when project title is empty", async () => {
    const supabase = { from: () => ({}) } as any;
    await expect(
      submitProject({
        shapes: [makeShapeWithResults()],
        projectSettings: { ...baseSettings, title: "" },
        supabase: supabase as any,
        companyId: "co-1",
        userId: "user-1",
      })
    ).rejects.toThrow("Please fill in title, start date, and end date");
  });

  it("throws when no shapes have calculator results", async () => {
    const supabase = { from: () => ({}) } as any;
    const shapeWithoutResults = makeShapeWithResults();
    delete (shapeWithoutResults as any).calculatorResults;

    await expect(
      submitProject({
        shapes: [shapeWithoutResults],
        projectSettings: baseSettings,
        supabase: supabase as any,
        companyId: "co-1",
        userId: "user-1",
      })
    ).rejects.toThrow("No elements with calculator results to submit");
  });

  it("throws when only Layer 1 shapes have results", async () => {
    const supabase = { from: () => ({}) } as any;
    const layer1Shape = makeShapeWithResults({ layer: 1 });

    await expect(
      submitProject({
        shapes: [layer1Shape],
        projectSettings: baseSettings,
        supabase: supabase as any,
        companyId: "co-1",
        userId: "user-1",
      })
    ).rejects.toThrow("No elements with calculator results to submit");
  });

  it("returns event ID on success", async () => {
    const fromFn = vi.fn((table: string) => {
      if (table === "event_tasks_with_dynamic_estimates") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [{ id: "tpl-1", name: "excavation" }], error: null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          insert: (data: unknown) => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "evt-123", ...(data as object) },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "task_folders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "folder-1" }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    });

    const supabase = { from: fromFn } as any;

    const eventId = await submitProject({
      shapes: [makeShapeWithResults()],
      projectSettings: baseSettings,
      supabase,
      companyId: "co-1",
      userId: "user-1",
    });

    expect(eventId).toBe("evt-123");
  });

  it("creates events row with correct title, dates, status, company_id", async () => {
    let capturedEventInsert: unknown = null;

    const fromFn = vi.fn((table: string) => {
      if (table === "event_tasks_with_dynamic_estimates") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          insert: (data: unknown) => {
            capturedEventInsert = data;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "evt-1", ...(data as object) },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === "task_folders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "folder-1" }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    });

    const supabase = { from: fromFn } as any;

    await submitProject({
      shapes: [makeShapeWithResults()],
      projectSettings: baseSettings,
      supabase,
      companyId: "co-1",
      userId: "user-1",
    });

    expect(capturedEventInsert).toMatchObject({
      title: "Test Project",
      start_date: "2025-03-01",
      end_date: "2025-03-15",
      status: "planned",
      company_id: "co-1",
    });
  });

  it("creates tasks_done for shapes with taskBreakdown", async () => {
    const taskInserts: unknown[] = [];

    const fromFn = vi.fn((table: string) => {
      if (table === "event_tasks_with_dynamic_estimates") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [{ id: "tpl-1", name: "excavation" }], error: null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: "evt-1" }, error: null }) }),
          }),
        };
      }
      if (table === "task_folders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "folder-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "tasks_done") {
        return {
          insert: (data: unknown) => {
            taskInserts.push(data);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    });

    const supabase = { from: fromFn } as any;

    await submitProject({
      shapes: [makeShapeWithResults()],
      projectSettings: baseSettings,
      supabase,
      companyId: "co-1",
      userId: "user-1",
    });

    expect(taskInserts.length).toBeGreaterThanOrEqual(1);
    expect(taskInserts.some((t: any) => t.name && t.hours_worked)).toBe(true);
  });

  it("creates materials_delivered for shapes with materials", async () => {
    const matInserts: unknown[] = [];

    const fromFn = vi.fn((table: string) => {
      if (table === "event_tasks_with_dynamic_estimates") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: "evt-1" }, error: null }) }),
          }),
        };
      }
      if (table === "task_folders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "folder-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "materials_delivered") {
        return {
          insert: (data: unknown) => {
            matInserts.push(data);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    });

    const supabase = { from: fromFn } as any;

    await submitProject({
      shapes: [makeShapeWithResults()],
      projectSettings: baseSettings,
      supabase,
      companyId: "co-1",
      userId: "user-1",
    });

    expect(matInserts.length).toBeGreaterThanOrEqual(1);
    expect(matInserts.some((m: any) => m.name === "Sand" && m.total_amount === 0.5)).toBe(true);
  });

  it("creates invoices row", async () => {
    let invoiceInsert: unknown = null;

    const fromFn = vi.fn((table: string) => {
      if (table === "event_tasks_with_dynamic_estimates") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: "evt-1" }, error: null }) }),
          }),
        };
      }
      if (table === "task_folders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "folder-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "invoices") {
        return {
          insert: (data: unknown) => {
            invoiceInsert = data;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      return {
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    });

    const supabase = { from: fromFn } as any;

    await submitProject({
      shapes: [makeShapeWithResults()],
      projectSettings: baseSettings,
      supabase,
      companyId: "co-1",
      userId: "user-1",
    });

    expect(invoiceInsert).toMatchObject({
      project_id: "evt-1",
      company_id: "co-1",
    });
  });
});
