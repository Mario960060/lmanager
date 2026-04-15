import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Printer, RotateCcw } from "lucide-react";
import { colors, shadows } from "../../themes/designTokens";
import { MIN_ZOOM, MAX_ZOOM } from "./geometry";
import {
  type GeodesyCardInfo,
  geoEntryKey,
} from "./visualization/geodesyLabels";

/** Above app sidebar (z-50) and main; portal to body avoids main being painted under aside. */
const GEO_PREVIEW_Z = 60000;

/** Match MasterProject dark canvas fill (C.bg) so letterboxing blends, not harsh black */
const PREVIEW_CANVAS_BG = "#1a1a2e";

function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 120;
  return delta;
}

const WHEEL_PAN_SENSITIVITY = 1;
const ARROW_PAN_STEP_PX = 48;
const CLICK_DRAG_THRESHOLD_PX = 6;
const WHEEL_ZOOM_FACTOR = 1.1;

type PreviewView = { zoom: number; panX: number; panY: number };

interface GeodesyPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmExport: () => void;
  isExporting: boolean;
  cardsInfo: GeodesyCardInfo[];
  hiddenEntries: Set<string>;
  onToggleEntryKeys: (keys: string[]) => void;
  previewDataUrl: string;
  /** Canvas logical coords (same as drawing / worldToScreen), DPR applied by caller */
  onPreviewImageLogicalClick: (logicalX: number, logicalY: number) => void;
  devicePixelRatio: number;
  highlightRowKey: string | null;
  showGeodesyLayerTabs: boolean;
  previewGeodesyLayer: 1 | 2;
  onPreviewGeodesyLayerChange: (layer: 1 | 2) => void;
}

function isEntryHidden(entry: GeodesyCardInfo["entries"][0], hidden: Set<string>): boolean {
  return entry.points.length > 0 && entry.points.every(p => hidden.has(geoEntryKey(p)));
}

function rowDomId(keys: string[]): string {
  return `geoprev-${keys.join("__").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export default function GeodesyPrintPreviewModal({
  isOpen,
  onClose,
  onConfirmExport,
  isExporting,
  cardsInfo,
  hiddenEntries,
  onToggleEntryKeys,
  previewDataUrl,
  onPreviewImageLogicalClick,
  devicePixelRatio,
  highlightRowKey,
  showGeodesyLayerTabs,
  previewGeodesyLayer,
  onPreviewGeodesyLayerChange,
}: GeodesyPrintPreviewModalProps) {
  const { t } = useTranslation("project");
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<PreviewView>({ zoom: 1, panX: 0, panY: 0 });

  const [previewPanning, setPreviewPanning] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    lastClientY: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, isExporting]);

  useEffect(() => {
    if (!isOpen || isExporting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      e.preventDefault();
      const step = ARROW_PAN_STEP_PX;
      setView(v => {
        let panX = v.panX;
        let panY = v.panY;
        if (e.key === "ArrowLeft") panX += step;
        else if (e.key === "ArrowRight") panX -= step;
        else if (e.key === "ArrowUp") panY += step;
        else panY -= step;
        return { ...v, panX, panY };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isExporting]);

  useLayoutEffect(() => {
    if (!isOpen || isExporting) return;
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (isExporting) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dy = wheelDeltaToPixels(e.deltaY, e.deltaMode) * WHEEL_PAN_SENSITIVITY;
        setView(v => ({ ...v, panY: v.panY - dy }));
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        const primary = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const dx = wheelDeltaToPixels(primary, e.deltaMode) * WHEEL_PAN_SENSITIVITY;
        setView(v => ({ ...v, panX: v.panX - dx }));
        return;
      }

      e.preventDefault();
      const f = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      setView(v => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * f));
        const ratio = newZoom / v.zoom;
        return {
          zoom: newZoom,
          panX: v.panX + (sx - cx) * (1 - ratio),
          panY: v.panY + (sy - cy) * (1 - ratio),
        };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen, isExporting]);

  useEffect(() => {
    if (!highlightRowKey || !isOpen) return;
    for (const card of cardsInfo) {
      for (const entry of card.entries) {
        const keys = entry.points.map((p) => geoEntryKey(p));
        if (keys.includes(highlightRowKey)) {
          const id = rowDomId(keys);
          document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return;
        }
      }
    }
  }, [highlightRowKey, isOpen, cardsInfo]);

  const logicalCoordsFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current;
      if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null;
      const rect = img.getBoundingClientRect();
      const u = (clientX - rect.left) / rect.width;
      const v = (clientY - rect.top) / rect.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      const bufX = u * img.naturalWidth;
      const bufY = v * img.naturalHeight;
      return {
        logicalX: bufX / devicePixelRatio,
        logicalY: bufY / devicePixelRatio,
      };
    },
    [devicePixelRatio],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isExporting) return;
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Node;
    if (!viewportRef.current?.contains(target)) return;
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      dragging: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.lastClientX;
    const dy = e.clientY - d.lastClientY;
    d.lastClientX = e.clientX;
    d.lastClientY = e.clientY;
    if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) >= CLICK_DRAG_THRESHOLD_PX) {
      d.dragging = true;
      setPreviewPanning(true);
    }
    if (d.dragging) {
      e.preventDefault();
      setView(v => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const moved = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
    const wasDrag = d.dragging || moved >= CLICK_DRAG_THRESHOLD_PX;
    dragRef.current = null;
    setPreviewPanning(false);
    if (wasDrag || isExporting) return;
    if (e.button !== 0) return;
    const pos = logicalCoordsFromClient(e.clientX, e.clientY);
    if (pos) onPreviewImageLogicalClick(pos.logicalX, pos.logicalY);
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setPreviewPanning(false);
  };

  const zoomIn = () => {
    setView(v => ({
      ...v,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * WHEEL_ZOOM_FACTOR)),
    }));
  };

  const zoomOut = () => {
    setView(v => ({
      ...v,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom / WHEEL_ZOOM_FACTOR)),
    }));
  };

  const resetView = () => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  };

  if (!isOpen) return null;

  const content = (
    <div
      className="geodesy-print-preview-root"
      style={{
        position: "fixed",
        inset: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        maxHeight: "100dvh",
        zIndex: GEO_PREVIEW_Z,
        display: "flex",
        flexDirection: "column",
        background: colors.bgElevated,
        boxShadow: shadows.modal,
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          borderBottom: `1px solid ${colors.borderDefault}`,
          background: colors.bgElevated,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 200px" }}>
            <Printer size={22} color={colors.accentBlue} style={{ flexShrink: 0 }} />
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: colors.textPrimary,
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {t("project:geodesy_print_preview_title")}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              style={{
                padding: "8px 14px",
                background: colors.bgOverlay,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: 8,
                color: colors.textPrimary,
                fontSize: 13,
                cursor: isExporting ? "default" : "pointer",
                opacity: isExporting ? 0.6 : 1,
              }}
            >
              {t("project:cancel_button")}
            </button>
            <button
              type="button"
              onClick={onConfirmExport}
              disabled={isExporting}
              style={{
                padding: "8px 16px",
                background: !isExporting ? colors.accentBlue : colors.bgOverlay,
                border: "none",
                borderRadius: 8,
                color: !isExporting ? "#fff" : colors.textDim,
                fontSize: 13,
                fontWeight: 600,
                cursor: isExporting ? "default" : "pointer",
                opacity: isExporting ? 0.6 : 1,
              }}
            >
              {isExporting ? t("project:plan_pdf_exporting") : t("project:plan_pdf_download")}
            </button>
          </div>
        </div>
        {showGeodesyLayerTabs ? (
          <div
            style={{
              display: "flex",
              marginTop: 10,
              borderRadius: 8,
              overflow: "hidden",
              border: `1px solid ${colors.borderDefault}`,
              maxWidth: "min(560px, 100%)",
            }}
          >
            <button
              type="button"
              disabled={isExporting}
              onClick={() => onPreviewGeodesyLayerChange(1)}
              style={{
                flex: 1,
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: isExporting ? "default" : "pointer",
                background: previewGeodesyLayer === 1 ? colors.accentBlue : colors.bgInput,
                color: previewGeodesyLayer === 1 ? "#fff" : colors.textPrimary,
              }}
            >
              {t("project:pdf_geodesy_layer1_label")}
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={() => onPreviewGeodesyLayerChange(2)}
              style={{
                flex: 1,
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                borderLeft: `1px solid ${colors.borderDefault}`,
                cursor: isExporting ? "default" : "pointer",
                background: previewGeodesyLayer === 2 ? colors.accentBlue : colors.bgInput,
                color: previewGeodesyLayer === 2 ? "#fff" : colors.textPrimary,
              }}
            >
              {t("project:pdf_geodesy_layer2_label")}
            </button>
          </div>
        ) : null}
      </div>

      <p
        style={{
          flexShrink: 0,
          margin: 0,
          padding: "8px 16px 6px",
          fontSize: 12,
          color: colors.textDim,
          lineHeight: 1.45,
          background: colors.bgElevated,
        }}
      >
        {t("project:geodesy_print_preview_hint")}
      </p>

      {/* Body: preview (max area) + narrow list */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: 4,
            background: PREVIEW_CANVAS_BG,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              padding: "4px 6px 8px",
            }}
          >
            <span style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.4, flex: "1 1 180px" }}>
              {t("project:geodesy_print_preview_nav_hint")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: colors.textPrimary, minWidth: 44 }}>
                {Math.round(view.zoom * 100)}%
              </span>
              <button
                type="button"
                disabled={isExporting || view.zoom <= MIN_ZOOM + 1e-6}
                onClick={zoomOut}
                title={t("project:geodesy_print_preview_zoom_out")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: 8,
                  border: `1px solid ${colors.borderDefault}`,
                  background: colors.bgInput,
                  color: colors.textPrimary,
                  cursor: isExporting ? "default" : "pointer",
                  opacity: isExporting || view.zoom <= MIN_ZOOM + 1e-6 ? 0.45 : 1,
                }}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                disabled={isExporting || view.zoom >= MAX_ZOOM - 1e-6}
                onClick={zoomIn}
                title={t("project:geodesy_print_preview_zoom_in")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: 8,
                  border: `1px solid ${colors.borderDefault}`,
                  background: colors.bgInput,
                  color: colors.textPrimary,
                  cursor: isExporting ? "default" : "pointer",
                  opacity: isExporting || view.zoom >= MAX_ZOOM - 1e-6 ? 0.45 : 1,
                }}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={resetView}
                title={t("project:geodesy_print_preview_reset_view")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 32,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: `1px solid ${colors.borderDefault}`,
                  background: colors.bgInput,
                  color: colors.textPrimary,
                  fontSize: 11,
                  cursor: isExporting ? "default" : "pointer",
                }}
              >
                <RotateCcw size={14} />
                {t("project:geodesy_print_preview_reset_view")}
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              overflow: "hidden",
              position: "relative",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              cursor: isExporting ? "default" : previewPanning ? "grabbing" : "grab",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
                transformOrigin: "50% 50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {previewDataUrl ? (
                <img
                  ref={imgRef}
                  src={previewDataUrl}
                  alt=""
                  draggable={false}
                  onDragStart={e => e.preventDefault()}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    display: "block",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitUserDrag: "none",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <span style={{ fontSize: 13, color: colors.textDim, padding: 24 }}>{t("project:geodesy_print_preview_loading")}</span>
              )}
            </div>
          </div>
        </div>

        <aside
          style={{
            width: "min(280px, 26vw)",
            minWidth: 240,
            maxWidth: 300,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: `1px solid ${colors.borderDefault}`,
            background: colors.bgElevated,
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: colors.textDim,
              padding: "8px 10px 6px",
              textTransform: "uppercase",
              borderBottom: `1px solid ${colors.borderDefault}`,
              flexShrink: 0,
            }}
          >
            {t("project:geodesy_print_preview_entries_heading")}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "6px 8px 12px", minHeight: 0 }}>
            {cardsInfo.length === 0 ? (
              <p style={{ fontSize: 12, color: colors.textDim, margin: 0 }}>{t("project:geodesy_print_preview_no_points")}</p>
            ) : (
              cardsInfo.map((card, ci) => (
                <div
                  key={ci}
                  style={{
                    marginBottom: 8,
                    padding: 8,
                    background: colors.bgInput,
                    borderRadius: 8,
                    border: `1px solid ${colors.borderDefault}`,
                  }}
                >
                  {card.entries.map((entry, ei) => {
                    const hidden = isEntryHidden(entry, hiddenEntries);
                    const keys = entry.points.map((p) => geoEntryKey(p));
                    const rowId = rowDomId(keys);
                    const rowHighlight =
                      highlightRowKey != null && keys.includes(highlightRowKey);
                    return (
                      <button
                        type="button"
                        id={rowId}
                        key={ei}
                        onClick={() => onToggleEntryKeys(keys)}
                        disabled={isExporting}
                        style={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 6,
                          padding: "6px 8px",
                          marginBottom: ei < card.entries.length - 1 ? 4 : 0,
                          border:
                            rowHighlight
                              ? `2px solid ${colors.accentBlue}`
                              : "2px solid transparent",
                          borderRadius: 6,
                          cursor: isExporting ? "default" : "pointer",
                          background: hidden ? "rgba(239,68,68,0.08)" : "transparent",
                          opacity: hidden ? 0.65 : 1,
                          textAlign: "left",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: colors.textPrimary,
                            textDecoration: hidden ? "line-through" : "none",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={entry.label}
                        >
                          {entry.label}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: "'JetBrains Mono', monospace",
                            color: colors.textPrimary,
                            textDecoration: hidden ? "line-through" : "none",
                            flexShrink: 0,
                          }}
                        >
                          {(entry.height * 100 >= 0 ? "+" : "")}
                          {(entry.height * 100).toFixed(1)}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: hidden ? colors.textDim : colors.accentBlue,
                            flexShrink: 0,
                            width: 52,
                            textAlign: "right",
                          }}
                        >
                          {hidden ? t("project:geodesy_print_preview_status_hidden") : t("project:geodesy_print_preview_status_visible")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
