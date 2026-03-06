/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectInfoBar from "../../../projectmanagement/canvacreator/ProjectInfoBar";
import { DEFAULT_PROJECT_SETTINGS } from "../../../projectmanagement/canvacreator/types";

describe("ProjectInfoBar", () => {
  it("renders title, dates, status inputs with initial values", () => {
    const settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      title: "My Project",
      startDate: "2025-03-01",
      endDate: "2025-03-15",
      status: "planned" as const,
    };
    const onChange = vi.fn();
    render(<ProjectInfoBar projectSettings={settings} onChange={onChange} />);

    const titleInput = screen.getByPlaceholderText("Project title");
    expect(titleInput).toHaveValue("My Project");

    // DatePicker displays in dd/MM/yyyy format
    const dateInputs = screen.getAllByDisplayValue(/01\/03\/2025|15\/03\/2025/);
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);

    const statusSelect = screen.getByDisplayValue("Planned");
    expect(statusSelect).toBeInTheDocument();
  });

  it("onChange fires with correct updates when user types title", () => {
    const settings = { ...DEFAULT_PROJECT_SETTINGS, title: "" };
    const onChange = vi.fn();
    render(<ProjectInfoBar projectSettings={settings} onChange={onChange} />);

    const titleInput = screen.getByPlaceholderText("Project title");
    fireEvent.change(titleInput, { target: { value: "New Title" } });

    expect(onChange).toHaveBeenCalledWith({ title: "New Title" });
  });

  it("onChange fires when start date changes", async () => {
    const settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      startDate: "2025-03-01",
      endDate: "2025-03-15",
    };
    const onChange = vi.fn();
    render(<ProjectInfoBar projectSettings={settings} onChange={onChange} />);

    // DatePicker displays in dd/MM/yyyy format
    const startInput = screen.getByDisplayValue("01/03/2025");
    fireEvent.change(startInput, { target: { value: "01/04/2025" } });

    expect(onChange).toHaveBeenCalledWith({ startDate: "2025-04-01" });
  });

  it("onChange fires when end date changes", async () => {
    const settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      startDate: "2025-03-01",
      endDate: "2025-03-15",
    };
    const onChange = vi.fn();
    render(<ProjectInfoBar projectSettings={settings} onChange={onChange} />);

    // DatePicker displays in dd/MM/yyyy format
    const endInput = screen.getByDisplayValue("15/03/2025");
    fireEvent.change(endInput, { target: { value: "15/04/2025" } });

    expect(onChange).toHaveBeenCalledWith({ endDate: "2025-04-15" });
  });

  it("onChange fires when status changes", async () => {
    const settings = {
      ...DEFAULT_PROJECT_SETTINGS,
      status: "planned" as const,
    };
    const onChange = vi.fn();
    render(<ProjectInfoBar projectSettings={settings} onChange={onChange} />);

    const statusSelect = screen.getByRole("combobox");
    fireEvent.change(statusSelect, { target: { value: "in_progress" } });

    expect(onChange).toHaveBeenCalledWith({ status: "in_progress" });
  });
});
