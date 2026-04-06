/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ObjectCardModal from "../../../projectmanagement/canvacreator/objectCard/ObjectCardModal";
import { Shape } from "../../../projectmanagement/canvacreator/geometry";
import { DEFAULT_PROJECT_SETTINGS } from "../../../projectmanagement/canvacreator/types";
import { toPixels } from "../../../projectmanagement/canvacreator/geometry";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

const createMockCalculator = vi.hoisted(() => {
  const React = require("react");
  return () => React.createElement("div", { "data-testid": "mock-calculator" }, "Calculator");
});

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));
vi.mock("../../../lib/store", () => ({
  useAuthStore: (fn: (s: { getCompanyId: () => string }) => unknown) =>
    fn({ getCompanyId: () => "test-company-id" }),
}));

vi.mock("../../../components/Calculator/WallCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/KerbsEdgesAndSetsCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/FenceCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/SlabCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/StairCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/LShapeStairCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/Ushapestaircalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/PavingCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/ArtificialGrassCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/FoundationCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/DeckCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/VenetianFenceCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/CompositeFenceCalculator", () => ({ default: createMockCalculator }));
vi.mock("../../../components/Calculator/NaturalTurfCalculator", () => ({ default: createMockCalculator }));

function makePolygonShape(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [
      { x: 0, y: 0 },
      { x: toPixels(2), y: 0 },
      { x: toPixels(2), y: toPixels(2) },
      { x: 0, y: toPixels(2) },
    ],
    closed: true,
    label: "Test Polygon",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [0, 0, 0, 0],
    elementType: "polygon",
    thickness: 0,
    ...overrides,
  };
}

function makeLinearShape(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [
      { x: 0, y: 0 },
      { x: toPixels(3), y: 0 },
    ],
    closed: false,
    label: "Test Fence",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [],
    elementType: "fence",
    thickness: 0.1,
    ...overrides,
  };
}

describe("ObjectCardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders shape label and auto-fill data for polygon", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    expect(screen.getByText(/Object Card — Test Polygon/)).toBeInTheDocument();
    expect(screen.getByText(/From canvas/)).toBeInTheDocument();
    expect(screen.getByText(/Area:/)).toBeInTheDocument();
  });

  it("renders type selector buttons for polygon element", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    expect(screen.getByText("Slabs (standard)")).toBeInTheDocument();
    expect(screen.getByText("Monoblock Paving")).toBeInTheDocument();
    expect(screen.getByText("Natural Turf")).toBeInTheDocument();
  });

  it("renders type selector for linear element (fence)", async () => {
    const shape = makeLinearShape({ elementType: "fence" });
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    expect(screen.getByText("Vertical Fence")).toBeInTheDocument();
    expect(screen.getByText("Horizontal Fence")).toBeInTheDocument();
    expect(screen.getByText(/Length:/)).toBeInTheDocument();
  });

  it("clicking a type selects it and shows calculator area", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    const slabBtn = screen.getByText("Slabs (standard)");
    fireEvent.click(slabBtn);
    expect(screen.getByTestId("mock-calculator")).toBeInTheDocument();
  });

  it("Save button is disabled when no type selected", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    const saveBtn = screen.getByRole("button", { name: "Save to shape" });
    expect(saveBtn).toBeDisabled();
  });

  it("turf selection shows Natural Turf calculator", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    fireEvent.click(screen.getByText("Natural Turf"));
    expect(screen.getByTestId("mock-calculator")).toBeInTheDocument();
  });

  it("turf Save requires calculator results (same as other calculators)", async () => {
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    fireEvent.click(screen.getByText("Natural Turf"));
    expect(screen.getByTestId("mock-calculator")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: "Save to shape" });
    expect(saveBtn).toBeDisabled();
  });

  it("onClose called when Cancel clicked", async () => {
    const onClose = vi.fn();
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={onClose}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("onClose called when X button clicked", async () => {
    const onClose = vi.fn();
    const shape = makePolygonShape();
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={onClose}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    const buttons = screen.getAllByRole("button");
    const xButton = buttons.find(
      b =>
        !b.textContent?.includes("Cancel") &&
        !b.textContent?.includes("Save to shape")
    );
    fireEvent.click(xButton!);
    expect(onClose).toHaveBeenCalled();
  });

  it("wall element shows brick and double wall subtype buttons (EN)", () => {
    const shape = makeLinearShape({ elementType: "wall" });
    render(
      <AllProviders>
        <ObjectCardModal
          shape={shape}
          shapeIdx={0}
          onClose={vi.fn()}
          onSave={vi.fn()}
          projectSettings={DEFAULT_PROJECT_SETTINGS}
        />
      </AllProviders>
    );

    expect(screen.getByRole("button", { name: "Brick Wall" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cavity / double-skin wall" })
    ).toBeInTheDocument();
  });
});
