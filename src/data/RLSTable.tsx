import { useState } from "react";
import { useTranslation } from "react-i18next";

type PermValue = "y" | "n" | "-" | "c";
type Category = "tasks" | "events" | "materials" | "other";
type Filter = "all" | Category;

interface TableRow {
  name: string;
  labelKey: string;
  tag?: "readonly";
  category: Category;
  user: [PermValue, PermValue, PermValue, PermValue];
  leader: [PermValue, PermValue, PermValue, PermValue];
  pm: [PermValue, PermValue, PermValue, PermValue];
}

const data: TableRow[] = [
  { name: "tasks (tasks_done)", labelKey: "rls_label_tasks", category: "tasks", user: ["y","y","y","n"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "task_progress_entries", labelKey: "rls_label_task_progress", category: "tasks", user: ["y","y","-","c"], leader: ["y","y","-","c"], pm: ["y","y","-","c"] },
  { name: "task_requirements", labelKey: "rls_label_task_requirements", tag: "readonly", category: "tasks", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "task_folders", labelKey: "rls_label_task_folders", category: "tasks", user: ["y","n","n","n"], leader: ["y","y","y","n"], pm: ["y","y","y","y"] },
  { name: "setup_digging", labelKey: "rls_label_setup_digging", category: "tasks", user: ["y","y","n","n"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "additional_tasks", labelKey: "rls_label_additional_tasks", category: "tasks", user: ["y","y","y","n"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "additional_task_progress_entries", labelKey: "rls_label_additional_task_progress", category: "tasks", user: ["y","y","-","c"], leader: ["y","y","-","c"], pm: ["y","y","-","c"] },
  { name: "events", labelKey: "rls_label_events", category: "events", user: ["y","y","y","n"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "event_tasks", labelKey: "rls_label_event_tasks", category: "events", user: ["y","y","y","-"], leader: ["y","y","y","-"], pm: ["y","y","y","-"] },
  { name: "hours_entries", labelKey: "rls_label_hours_entries", tag: "readonly", category: "events", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "equipment_usage", labelKey: "rls_label_equipment_usage", tag: "readonly", category: "events", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "equipment", labelKey: "rls_label_equipment", category: "events", user: ["y","y","y","y"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "materials_delivered", labelKey: "rls_label_materials_delivered", tag: "readonly", category: "materials", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "materials (event)", labelKey: "rls_label_materials_event", category: "materials", user: ["y","y","y","-"], leader: ["y","y","y","-"], pm: ["y","y","y","-"] },
  { name: "calendar_materials", labelKey: "rls_label_calendar_materials", tag: "readonly", category: "materials", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "additional_materials", labelKey: "rls_label_additional_materials", category: "materials", user: ["y","y","y","y"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "additional_task_materials", labelKey: "rls_label_additional_task_materials", category: "materials", user: ["y","y","y","y"], leader: ["y","y","y","y"], pm: ["y","y","y","y"] },
  { name: "day_notes", labelKey: "rls_label_day_notes", tag: "readonly", category: "other", user: ["y","y","-","-"], leader: ["y","y","-","-"], pm: ["y","y","-","-"] },
  { name: "deletion_requests", labelKey: "rls_label_deletion_requests", category: "other", user: ["y","y","n","n"], leader: ["y","y","n","n"], pm: ["y","y","y","y"] },
  { name: "invoices", labelKey: "rls_label_invoices", category: "other", user: ["n","n","n","n"], leader: ["n","n","n","n"], pm: ["y","y","y","n"] },
];

const getFilters = (t: (key: string) => string): { label: string; value: Filter }[] => [
  { label: t("common:rls_filter_all"), value: "all" },
  { label: t("common:rls_filter_tasks"), value: "tasks" },
  { label: t("common:rls_filter_events"), value: "events" },
  { label: t("common:rls_filter_materials"), value: "materials" },
  { label: t("common:rls_filter_other"), value: "other" },
];

/* ── Original HTML color palette ── */

const c = {
  bg: "#0c0e14",
  surface: "#13151e",
  surfaceAlt: "rgba(255,255,255,0.04)",
  surfaceHover: "#1a1d2a",
  border: "#1e2233",
  borderLight: "#2a2e42",
  text: "#e2e4ed",
  textMuted: "#6b7194",
  textDim: "#454a66",
  green: "#34d399",
  greenBg: "rgba(52, 211, 153, 0.08)",
  greenBorder: "rgba(52, 211, 153, 0.2)",
  red: "#f87171",
  redBg: "rgba(248, 113, 113, 0.06)",
  redBorder: "rgba(248, 113, 113, 0.15)",
  yellow: "#fbbf24",
  yellowBg: "rgba(251, 191, 36, 0.08)",
  yellowBorder: "rgba(251, 191, 36, 0.15)",
  blue: "#60a5fa",
  blueBg: "rgba(96, 165, 250, 0.08)",
  blueBorder: "rgba(96, 165, 250, 0.2)",
  roleUser: "#60a5fa",
  roleLeader: "#a78bfa",
  rolePm: "#f472b6",
} as const;

/* ── PermCell ── */

function PermCell({ value, tooltip }: { value: PermValue; tooltip?: string }) {
  const [hover, setHover] = useState(false);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    transition: "transform 0.15s",
    cursor: value === "c" ? "help" : "default",
    position: "relative",
    transform: hover ? "scale(1.2)" : "scale(1)",
  };

  const map: Record<PermValue, { style: React.CSSProperties; icon: string }> = {
    y: { style: { ...base, background: c.greenBg, color: c.green, border: `1px solid ${c.greenBorder}` }, icon: "✓" },
    n: { style: { ...base, background: c.redBg, color: c.red, border: `1px solid ${c.redBorder}` }, icon: "✗" },
    "-": { style: { ...base, background: c.yellowBg, color: c.yellow, border: `1px solid ${c.yellowBorder}`, fontSize: 16 }, icon: "–" },
    c: { style: { ...base, background: c.blueBg, color: c.blue, border: `1px solid ${c.blueBorder}`, fontSize: 11, fontWeight: 700 }, icon: "✓*" },
  };

  const { style, icon } = map[value];

  return (
    <span style={style} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {icon}
      {value === "c" && tooltip && hover && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: c.border,
            color: c.text,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 400,
            whiteSpace: "nowrap",
            border: `1px solid ${c.borderLight}`,
            zIndex: 100,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

/* ── RoleColumns ── */

const getDeleteTooltips = (t: (key: string) => string): Record<string, string> => ({
  user: t("common:rls_delete_tooltip_user"),
  leader: t("common:rls_delete_tooltip_leader"),
  pm: t("common:rls_delete_tooltip_pm"),
});

function RoleColumns({ perms, role, t, deleteTooltips }: { perms: [PermValue, PermValue, PermValue, PermValue]; role: "user" | "leader" | "pm"; t: (key: string) => string; deleteTooltips: Record<string, string> }) {
  return (
    <>
      {perms.map((p, i) => (
        <td
          key={`${role}-${i}`}
          style={{
            padding: "10px 0",
            textAlign: "center",
            borderBottom: `1px solid ${c.border}`,
            borderLeft: i === 0 ? `1px solid ${c.borderLight}` : undefined,
          }}
        >
          <PermCell value={p} tooltip={p === "c" ? deleteTooltips[role] : undefined} />
        </td>
      ))}
    </>
  );
}

/* ── Inline code style helper ── */

const codeStyle = (color: string, bg: string): React.CSSProperties => ({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  background: bg,
  color,
  padding: "1px 5px",
  borderRadius: 4,
});

/* ── Main Component ── */

const crudLabelKeys = ["rls_crud_select", "rls_crud_insert", "rls_crud_update", "rls_crud_delete"] as const;

export function RLSPermissionsTable() {
  const { t } = useTranslation("common");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const filters = getFilters(t);
  const deleteTooltips = getDeleteTooltips(t);
  const filtered = activeFilter === "all" ? data : data.filter((r) => r.category === activeFilter);

  const roles = [
    { label: t("rls_role_user"), color: c.roleUser },
    { label: t("rls_role_leader"), color: c.roleLeader },
    { label: t("rls_role_pm"), color: c.rolePm },
  ];

  const legendItems = [
    { icon: "✓", labelKey: "rls_legend_access", bg: c.greenBg, fg: c.green, bd: c.greenBorder },
    { icon: "✗", labelKey: "rls_legend_no_access", bg: c.redBg, fg: c.red, bd: c.redBorder },
    { icon: "–", labelKey: "rls_legend_no_policy", bg: c.yellowBg, fg: c.yellow, bd: c.yellowBorder },
    { icon: "✓*", labelKey: "rls_legend_conditional", bg: c.blueBg, fg: c.blue, bd: c.blueBorder },
  ];

  const notesContent = [
    t("rls_notes_crud"),
    t("rls_notes_conditional_delete"),
    t("rls_notes_readonly"),
    t("rls_notes_invoices"),
  ];

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'Outfit', 'Segoe UI', sans-serif", padding: "40px 24px", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        {/* Lewa kolumna: tytuł, legenda, filtry | Prawa kolumna: Notes — na całą wysokość */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(300px, 380px)", gap: 24, marginBottom: 24, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 8, background: `linear-gradient(135deg, ${c.text} 0%, ${c.textMuted} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {t("rls_matrix_title")}
              </h1>
              <p style={{ color: c.textMuted, fontSize: 14 }}>{t("rls_matrix_subtitle")}</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "18px 24px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, width: "fit-content" }}>
              {legendItems.map((item) => (
                <div key={item.labelKey} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: c.text, fontFamily: "'Outfit', 'Segoe UI', sans-serif" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, background: item.bg, color: item.fg, border: `1px solid ${item.bd}` }}>
                    {item.icon}
                  </span>
                  {t(item.labelKey)}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filters.map((f) => {
                const active = activeFilter === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setActiveFilter(f.value)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: `1px solid ${active ? c.blue : c.border}`,
                      background: active ? c.blueBg : c.surface,
                      color: active ? c.blue : c.textMuted,
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ flex: 1, padding: "20px 24px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "'Outfit', 'Segoe UI', sans-serif" }}>
                {t("rls_notes_title")}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notesContent.map((content, i) => (
                  <p key={i} style={{ fontSize: 15, color: c.text, paddingLeft: 18, position: "relative", lineHeight: 1.6, fontFamily: "'Outfit', 'Segoe UI', sans-serif" }}>
                    <span style={{ position: "absolute", left: 0, color: c.blue, fontWeight: 700 }}>›</span>
                    {content}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", border: `1px solid ${c.border}`, borderRadius: 14, background: c.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: "left", paddingLeft: 20, paddingBottom: 12, verticalAlign: "bottom", color: c.text, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", background: c.surface, fontFamily: "'Outfit', 'Segoe UI', sans-serif" }}>
                  {t("rls_table_header")}
                </th>
                {roles.map((role, idx) => (
                  <th key={role.label} colSpan={4} style={{ padding: "16px 8px 4px", textAlign: "center", background: c.surface, borderLeft: idx > 0 ? `1px solid ${c.borderLight}` : undefined }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.8px", background: `${role.color}18`, color: role.color }}>
                      {role.label}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {[0, 1, 2].map((roleIdx) =>
                  crudLabelKeys.map((labelKey, i) => (
                    <th
                      key={`crud-${roleIdx}-${i}`}
                      style={{
                        padding: "6px 4px 14px",
                        fontFamily: "'Outfit', 'Segoe UI', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: c.text,
                        textAlign: "center",
                        borderBottom: `1px solid ${c.border}`,
                        background: c.surface,
                        minWidth: 72,
                        borderLeft: i === 0 && roleIdx > 0 ? `1px solid ${c.borderLight}` : undefined,
                      }}
                    >
                      {t(labelKey)}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={row.name}
                  style={{ transition: "background 0.15s", background: idx % 2 === 1 ? c.surfaceAlt : undefined }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.surfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? c.surfaceAlt : "transparent")}
                >
                  <td style={{ textAlign: "left", padding: "10px 0 10px 20px", fontSize: 13, fontWeight: 500, color: c.text, borderBottom: `1px solid ${c.border}` }} title={row.name}>
                    {t(row.labelKey)}
                    {row.tag === "readonly" && (
                      <span style={{ display: "inline-block", marginLeft: 8, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", background: c.yellowBg, color: c.yellow }}>
                        {t("rls_tag_readonly")}
                      </span>
                    )}
                  </td>
                  <RoleColumns perms={row.user} role="user" t={t} deleteTooltips={deleteTooltips} />
                  <RoleColumns perms={row.leader} role="leader" t={t} deleteTooltips={deleteTooltips} />
                  <RoleColumns perms={row.pm} role="pm" t={t} deleteTooltips={deleteTooltips} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}