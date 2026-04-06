/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectSummaryPanel from "../../../projectmanagement/canvacreator/ProjectSummaryPanel";
import { Shape } from "../../../projectmanagement/canvacreator/geometry";

function makeShape(overrides: Partial<Shape> = {}): Shape {
  return {
    points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }],
    closed: true,
    label: "Test Shape",
    layer: 2,
    lockedEdges: [],
    lockedAngles: [],
    heights: [0, 0, 0],
    elementType: "polygon",
    thickness: 0,
    ...overrides,
  };
}

describe("ProjectSummaryPanel", () => {
  it("renders no elements state when shapes array is empty", () => {
    const onCreateProject = vi.fn();
    render(<ProjectSummaryPanel shapes={[]} onCreateProject={onCreateProject} />);

    expect(screen.getByText(/No elements on Layer 2/)).toBeInTheDocument();
    expect(screen.getByText(/assign a calculation type/)).toBeInTheDocument();
  });

  it("renders list of Layer 2 shapes with correct badges", () => {
    const shapes: Shape[] = [
      makeShape({ label: "Slab 1", calculatorType: "slab" }),
      makeShape({ label: "Fence 1", elementType: "fence", calculatorType: "fence" }),
    ];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={vi.fn()} />);

    expect(screen.getByText("Slab 1")).toBeInTheDocument();
    expect(screen.getByText("Fence 1")).toBeInTheDocument();
    expect(screen.getByText("SL")).toBeInTheDocument();
    expect(screen.getByText("FC")).toBeInTheDocument();
  });

  it("shows warning when shapes lack calculators", () => {
    const shapes: Shape[] = [
      makeShape({ label: "With Calc", calculatorType: "slab", calculatorResults: { hours_worked: 2 } }),
      makeShape({ label: "No Calc", calculatorType: undefined }),
    ];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={vi.fn()} />);

    expect(
      screen.getByText(/1 element\(s\) without an assigned calculation type/)
    ).toBeInTheDocument();
  });

  it("collapse/expand toggle works", () => {
    const shapes = [makeShape()];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={vi.fn()} />);

    expect(screen.getByText("Project Summary")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    const collapseBtn = buttons[0];
    fireEvent.click(collapseBtn);

    expect(screen.getByText(/Summary \(1\)/)).toBeInTheDocument();

    const expandBtn = screen.getByRole("button");
    fireEvent.click(expandBtn);

    expect(screen.getByText("Project Summary")).toBeInTheDocument();
  });

  it("Create Project button calls onCreateProject", () => {
    const onCreateProject = vi.fn();
    const shapes = [makeShape({ calculatorResults: { hours_worked: 1 } })];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={onCreateProject} />);

    const createBtn = screen.getByRole("button", { name: "Create Project" });
    fireEvent.click(createBtn);

    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it("Create Project button is disabled when no Layer 2 shapes", () => {
    const onCreateProject = vi.fn();
    render(<ProjectSummaryPanel shapes={[]} onCreateProject={onCreateProject} />);

    const createBtn = screen.getByRole("button", { name: "Create Project" });
    expect(createBtn).toBeDisabled();
  });

  it("Create Project button is disabled when isSubmitting", () => {
    const shapes = [makeShape()];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={vi.fn()} isSubmitting />);

    const createBtn = screen.getByRole("button", { name: "Creating..." });
    expect(createBtn).toBeDisabled();
  });

  it("filters only Layer 2 shapes", () => {
    const shapes: Shape[] = [
      makeShape({ layer: 1, label: "Layer 1" }),
      makeShape({ layer: 2, label: "Layer 2" }),
    ];
    render(<ProjectSummaryPanel shapes={shapes} onCreateProject={vi.fn()} />);

    expect(screen.getByText("Layer 2")).toBeInTheDocument();
    expect(screen.queryByText("Layer 1")).not.toBeInTheDocument();
  });
});
