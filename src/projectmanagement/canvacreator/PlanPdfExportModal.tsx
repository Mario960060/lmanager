import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileDown } from "lucide-react";
import { colors, shadows } from "../../themes/designTokens";
import { useBackdropPointerDismiss } from "../../hooks/useBackdropPointerDismiss";

interface PlanPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (layers: number[]) => void;
  isExporting: boolean;
}

const LAYERS = [
  { id: 1, key: "garden_label" },
  { id: 2, key: "elements_label" },
  { id: 3, key: "pattern_label" },
  { id: 4, key: "preparation_label" },
] as const;

export default function PlanPdfExportModal({
  isOpen,
  onClose,
  onExport,
  isExporting,
}: PlanPdfExportModalProps) {
  const { t } = useTranslation("project");
  const [selected, setSelected] = React.useState<Set<number>>(new Set([1, 2, 3, 4]));

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, isExporting]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const layers = Array.from(selected).sort((a, b) => a - b);
    if (layers.length === 0) return;
    onExport(layers);
  };

  const backdropDismiss = useBackdropPointerDismiss(onClose, isOpen && !isExporting);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropDismiss.backdropRef}
      className="canvas-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: colors.bgModalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onPointerDown={!isExporting ? backdropDismiss.onBackdropPointerDown : undefined}
    >
      <div
        className="canvas-modal-content"
        style={{
          background: colors.bgElevated,
          border: `1px solid ${colors.borderDefault}`,
          borderRadius: 16,
          width: "90%",
          maxWidth: 400,
          padding: 24,
          boxShadow: shadows.modal,
        }}
        onPointerDownCapture={backdropDismiss.onPanelPointerDownCapture}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <FileDown size={24} color={colors.accentBlue} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colors.textPrimary }}>{t("project:plan_pdf_export_title")}</h2>
        </div>
        <p style={{ fontSize: 13, color: colors.textDim, marginBottom: 20 }}>{t("project:plan_pdf_export_desc")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {LAYERS.map(({ id, key }) => (
            <label
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: colors.bgInput,
                borderRadius: 8,
                border: `1px solid ${colors.borderDefault}`,
                cursor: isExporting ? "default" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(id)}
                onChange={() => toggle(id)}
                disabled={isExporting}
                style={{ accentColor: colors.accentBlue, width: 18, height: 18 }}
              />
              <span style={{ color: colors.textPrimary, fontSize: 14 }}>{t(`project:${key}`)}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={isExporting}
            style={{
              padding: "10px 20px",
              background: colors.bgOverlay,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: 8,
              color: colors.textPrimary,
              fontSize: 14,
              cursor: isExporting ? "default" : "pointer",
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {t("project:cancel_button")}
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || selected.size === 0}
            style={{
              padding: "10px 20px",
              background: selected.size > 0 && !isExporting ? colors.accentBlue : colors.bgOverlay,
              border: "none",
              borderRadius: 8,
              color: selected.size > 0 && !isExporting ? "#fff" : colors.textDim,
              fontSize: 14,
              fontWeight: 600,
              cursor: isExporting || selected.size === 0 ? "default" : "pointer",
              opacity: isExporting ? 0.6 : 1,
            }}
          >
            {isExporting ? t("project:plan_pdf_exporting") : t("project:plan_pdf_download")}
          </button>
        </div>
      </div>
    </div>
  );
}
