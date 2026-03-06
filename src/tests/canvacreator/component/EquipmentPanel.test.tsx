/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EquipmentPanel from "../../../projectmanagement/canvacreator/EquipmentPanel";
import { DEFAULT_PROJECT_SETTINGS } from "../../../projectmanagement/canvacreator/types";

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}));
vi.mock("../../../lib/store", () => ({
  useAuthStore: (fn: (s: { getCompanyId: () => string }) => unknown) =>
    fn({ getCompanyId: () => "test-company-id" }),
}));

describe("EquipmentPanel", () => {

  it("returns null when not open", () => {
    const { container } = render(
      <EquipmentPanel
        isOpen={false}
        onClose={vi.fn()}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal when open", async () => {
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Equipment & Transport")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("renders equipment dropdowns when loaded", async () => {
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Excavator")).toBeInTheDocument();
      expect(screen.getByText("Carrier (soil, tape1)")).toBeInTheDocument();
      expect(screen.getByText("Carrier (slabs, pavers, cobblestone)")).toBeInTheDocument();
      expect(screen.getByText("Wacker / Compactor")).toBeInTheDocument();
      expect(screen.getAllByRole("combobox")).toHaveLength(4);
    });
  });

  it("compactor dropdown always shows with static options when DB has no compactors", async () => {
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Wacker / Compactor")).toBeInTheDocument();
    });

    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(4);
    const compactorSelect = comboboxes[3];
    const options = Array.from(compactorSelect.querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(1);
    expect(options[0].value).toBe("");
    expect(options[0].textContent).toBe("None");
    expect(options.some(o => o.value === "small_compactor" || o.value === "medium_compactor")).toBe(true);
  });

  it("Done button calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={onClose}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("transport checkbox toggles distance input visibility when calculateTransport is true", async () => {
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={{ ...DEFAULT_PROJECT_SETTINGS, calculateTransport: true }}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. 30")).toBeInTheDocument();
    });
  });

  it("transport distance input hidden when calculateTransport is false", async () => {
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={{ ...DEFAULT_PROJECT_SETTINGS, calculateTransport: false }}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Equipment & Transport")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("e.g. 30")).not.toBeInTheDocument();
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={onClose}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={vi.fn()}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByText("Equipment & Transport")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("onSave called when transport checkbox changed", async () => {
    const onSave = vi.fn();
    render(
      <EquipmentPanel
        isOpen={true}
        onClose={vi.fn()}
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        onSave={onSave}
      />
    );

    await vi.waitFor(() => {
      expect(screen.getByLabelText(/Calculate transport/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Calculate transport/));
    expect(onSave).toHaveBeenCalledWith({ calculateTransport: true });
  });
});
