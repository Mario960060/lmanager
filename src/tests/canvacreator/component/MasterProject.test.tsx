/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MasterProject from "../../../projectmanagement/canvacreator/MasterProject";

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}));

vi.mock("../../../lib/store", () => ({
  useAuthStore: Object.assign(
    () => ({ user: { id: "test-user-id" } }),
    { getState: () => ({ getCompanyId: () => "test-company-id" }) }
  ),
}));

describe("MasterProject", () => {
  beforeEach(() => {
    global.ResizeObserver = class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(_callback: ResizeObserverCallback) {}
    } as unknown as typeof ResizeObserver;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      clip: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
      setLineDash: vi.fn(),
    });
  });

  it("renders without crashing", () => {
    const { container } = render(
      <MemoryRouter>
        <MasterProject />
      </MemoryRouter>
    );
    expect(container).toBeInTheDocument();
  });

  it("renders canvas element", () => {
    render(
      <MemoryRouter>
        <MasterProject />
      </MemoryRouter>
    );
    const canvas = document.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders mode buttons", () => {
    render(
      <MemoryRouter>
        <MasterProject />
      </MemoryRouter>
    );
    expect(screen.getByText("Select")).toBeInTheDocument();
  });
});
