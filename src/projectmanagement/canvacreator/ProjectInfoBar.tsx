// ══════════════════════════════════════════════════════════════
// ProjectInfoBar — Title, dates, status above canvas
// ══════════════════════════════════════════════════════════════

import React from "react";
import { useTranslation } from "react-i18next";
import { ProjectSettings } from "./types";
import { C } from "./geometry";
import DatePicker from "../../components/DatePicker";

interface ProjectInfoBarProps {
  projectSettings: ProjectSettings;
  onChange: (updates: Partial<ProjectSettings>) => void;
}

export default function ProjectInfoBar({ projectSettings, onChange }: ProjectInfoBarProps) {
  const { t } = useTranslation(["project", "event"]);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "8px 16px",
      background: C.panel,
      borderBottom: `1px solid ${C.panelBorder}`,
      flexShrink: 0,
      flexWrap: "wrap",
    }}>
      <input
        type="text"
        placeholder={t("project:enter_project_title")}
        value={projectSettings.title}
        onChange={e => onChange({ title: e.target.value })}
        style={{
          flex: "1 1 200px",
          minWidth: 120,
          padding: "6px 12px",
          background: C.bg,
          border: `1px solid ${C.panelBorder}`,
          borderRadius: 6,
          color: C.text,
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
      <div style={{ minWidth: 120 }}>
        <DatePicker
          value={projectSettings.startDate}
          onChange={v => onChange({ startDate: v })}
          className="!py-1.5 !px-3 text-sm"
        />
      </div>
      <div style={{ minWidth: 120 }}>
        <DatePicker
          value={projectSettings.endDate}
          onChange={v => onChange({ endDate: v })}
          className="!py-1.5 !px-3 text-sm"
        />
      </div>
      <select
        value={projectSettings.status}
        onChange={e => onChange({ status: e.target.value as ProjectSettings["status"] })}
        style={{
          padding: "6px 12px",
          background: C.bg,
          border: `1px solid ${C.panelBorder}`,
          borderRadius: 6,
          color: C.text,
          fontSize: 13,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        <option value="planned">{t("event:planned")}</option>
        <option value="scheduled">{t("event:scheduled")}</option>
        <option value="in_progress">{t("event:in_progress")}</option>
      </select>
    </div>
  );
}
