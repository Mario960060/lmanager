import { useState, useRef, useEffect, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

const Z_BACKDROP = 50000;
const Z_MODAL = 50001;

/** Wartość w cm — zaokrąglenie do 1 mm (0,1 cm). */
export function roundCmToOneMm(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return Math.round(cm * 10) / 10;
}

function cmToModalInputString(cm: number): string {
  if (!Number.isFinite(cm)) return "";
  return String(roundCmToOneMm(cm));
}

// ─────────────────────────────────────────────────────────────
// Typy
// ─────────────────────────────────────────────────────────────

export type GeodesyPointModalMode = "height" | "depth" | "preparation";

export interface GeodesyPointModalProps {
  mode: GeodesyPointModalMode;
  pointId: string | number;
  initialValue: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
  /** Pozycja modala na ekranie (np. blisko klikniętego punktu) */
  position?: { x: number; y: number };
}

export interface GeodesyHeightsBulkModalProps {
  rows: { rowIdx: number; label: string; initialCm: number }[];
  baselineHeightValues: string[];
  onConfirm: (nextValues: string[]) => void;
  onCancel: () => void;
  position?: { x: number; y: number };
}

// ─────────────────────────────────────────────────────────────
// Konfiguracja per tryb (kolory jak w mocku Landscape Manager)
// ─────────────────────────────────────────────────────────────

function useModeStyle(mode: GeodesyPointModalMode) {
  const { t } = useTranslation("project");
  return useMemo(() => {
    if (mode === "height") {
      return {
        title: t("geodesy_modal_height_title"),
        label: t("geodesy_modal_height_label"),
        hint: t("geodesy_modal_height_hint"),
        accentColor: "#00d4aa",
        accentBg: "rgba(0, 212, 170, 0.10)",
        tagBg: "rgba(0, 212, 170, 0.12)",
        tagColor: "#00d4aa",
        iconPath: "M8 2v12M5 5l3-3 3 3",
      };
    }
    if (mode === "depth") {
      return {
        title: t("geodesy_modal_depth_title"),
        label: t("geodesy_modal_depth_label"),
        hint: t("geodesy_modal_depth_hint"),
        accentColor: "#85B7EB",
        accentBg: "rgba(59, 139, 212, 0.10)",
        tagBg: "rgba(59, 139, 212, 0.12)",
        tagColor: "#85B7EB",
        iconPath: "M8 14V2M5 11l3 3 3-3",
      };
    }
    return {
      title: t("geodesy_modal_preparation_title"),
      label: t("geodesy_modal_preparation_label"),
      hint: t("geodesy_modal_preparation_hint"),
      accentColor: "#85B7EB",
      accentBg: "rgba(59, 139, 212, 0.10)",
      tagBg: "rgba(59, 139, 212, 0.12)",
      tagColor: "#85B7EB",
      iconPath: "M8 14V2M5 11l3 3 3-3",
    };
  }, [mode, t]);
}

// ─────────────────────────────────────────────────────────────
// Pojedynczy punkt (wysokość geodezyjna / głębokość / przygotowanie)
// ─────────────────────────────────────────────────────────────

export function GeodesyPointModal({
  mode,
  pointId,
  initialValue,
  onConfirm,
  onCancel,
  position,
}: GeodesyPointModalProps) {
  const { t } = useTranslation(["project", "common"]);
  const [value, setValue] = useState<string>(() => cmToModalInputString(initialValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const config = useModeStyle(mode);

  useEffect(() => {
    setValue(cmToModalInputString(initialValue));
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [onCancel]);

  const handleConfirm = () => {
    const parsed = parseFloat(value.replace(",", "."));
    if (!Number.isNaN(parsed)) {
      onConfirm(roundCmToOneMm(parsed));
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  };

  const positionStyle: CSSProperties = position
    ? {
        position: "fixed",
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -120%)",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };

  const tagText = t("project:geodesy_modal_point_tag", { n: pointId });

  return (
    <>
      <div style={{ ...styles.backdrop, zIndex: Z_BACKDROP }} />
      <div ref={modalRef} style={{ ...styles.modal, zIndex: Z_MODAL, ...positionStyle }}>
        <div style={styles.header}>
          <div style={{ ...styles.icon, background: config.accentBg }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke={config.accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={config.iconPath} />
            </svg>
          </div>
          <span style={styles.title}>{config.title}</span>
        </div>

        <div style={styles.body}>
          <div style={styles.labelRow}>
            <span style={styles.label}>{config.label}</span>
            <span
              style={{
                ...styles.tag,
                background: config.tagBg,
                color: config.tagColor,
              }}
            >
              {tagText}
            </span>
          </div>

          <div style={styles.inputRow}>
            <input
              ref={inputRef}
              className="geodesy-modal-number-input"
              type="number"
              step="0.1"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                ...styles.input,
                borderColor: "#3a4158",
              }}
              onFocus={e => {
                e.target.style.borderColor = config.accentColor;
              }}
              onBlur={e => {
                e.target.style.borderColor = "#3a4158";
                const p = parseFloat(value.replace(",", "."));
                if (!Number.isNaN(p)) setValue(cmToModalInputString(p));
              }}
            />
            <span style={styles.unit}>cm</span>
          </div>

          <div style={styles.hint}>{config.hint}</div>
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            style={styles.btnCancel}
            onClick={onCancel}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#2a3142";
              e.currentTarget.style.color = "#c0c4d4";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#8a8fa8";
            }}
          >
            {t("project:cancel")}
          </button>
          <button
            type="button"
            style={{ ...styles.btnOk, background: config.accentColor }}
            onClick={handleConfirm}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "0.85";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {t("common:ok")}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Wiele wierszy wysokości (klik w kartę geodezyjną)
// ─────────────────────────────────────────────────────────────

export function GeodesyHeightsBulkModal({
  rows,
  baselineHeightValues,
  onConfirm,
  onCancel,
  position,
}: GeodesyHeightsBulkModalProps) {
  const { t } = useTranslation(["project", "common"]);
  const [rowInputs, setRowInputs] = useState<string[]>(() =>
    rows.map(r => {
      const raw = baselineHeightValues[r.rowIdx];
      const p = parseFloat(String(raw ?? "").replace(",", "."));
      const base = Number.isFinite(p) ? p : r.initialCm;
      return cmToModalInputString(base);
    }),
  );
  const modalRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const config = useModeStyle("height");

  useEffect(() => {
    const timer = setTimeout(() => {
      firstRef.current?.focus();
      firstRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [onCancel]);

  const positionStyle: CSSProperties = position
    ? {
        position: "fixed",
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -120%)",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };

  const handleConfirm = () => {
    const next = [...baselineHeightValues];
    for (let i = 0; i < rows.length; i++) {
      const parsed = parseFloat(rowInputs[i]?.replace(",", ".") ?? "");
      if (Number.isNaN(parsed)) continue;
      next[rows[i].rowIdx] = String(roundCmToOneMm(parsed));
    }
    onConfirm(next);
  };

  return (
    <>
      <div style={{ ...styles.backdrop, zIndex: Z_BACKDROP }} />
      <div
        ref={modalRef}
        style={{
          ...styles.modal,
          zIndex: Z_MODAL,
          ...positionStyle,
          width: 360,
          maxHeight: "min(70vh, 420px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={styles.header}>
          <div style={{ ...styles.icon, background: config.accentBg }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke={config.accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={config.iconPath} />
            </svg>
          </div>
          <span style={styles.title}>{t("project:geodesy_modal_bulk_title")}</span>
        </div>

        <div
          style={{
            ...styles.body,
            flex: 1,
            overflowY: "auto",
            paddingTop: 8,
          }}
        >
          <div style={{ ...styles.hint, marginTop: 0, marginBottom: 12 }}>{t("project:geodesy_modal_bulk_hint")}</div>
          {rows.map((row, i) => (
            <div key={row.rowIdx} style={{ marginBottom: i < rows.length - 1 ? 14 : 0 }}>
              <div style={styles.labelRow}>
                <span style={styles.label}>{row.label || t("project:geodesy_modal_height_label")}</span>
              </div>
              <div style={styles.inputRow}>
                <input
                  ref={i === 0 ? firstRef : undefined}
                  className="geodesy-modal-number-input"
                  type="number"
                  step="0.1"
                  value={rowInputs[i] ?? ""}
                  onChange={e => {
                    const v = [...rowInputs];
                    v[i] = e.target.value;
                    setRowInputs(v);
                  }}
                  style={{
                    ...styles.input,
                    borderColor: "#3a4158",
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = config.accentColor;
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "#3a4158";
                    const p = parseFloat((rowInputs[i] ?? "").replace(",", "."));
                    if (!Number.isNaN(p)) {
                      const v = [...rowInputs];
                      v[i] = cmToModalInputString(p);
                      setRowInputs(v);
                    }
                  }}
                />
                <span style={styles.unit}>cm</span>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            style={styles.btnCancel}
            onClick={onCancel}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#2a3142";
              e.currentTarget.style.color = "#c0c4d4";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#8a8fa8";
            }}
          >
            {t("project:cancel")}
          </button>
          <button
            type="button"
            style={{ ...styles.btnOk, background: config.accentColor }}
            onClick={handleConfirm}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "0.85";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {t("common:ok")}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Style
// ─────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(10, 12, 20, 0.55)",
  },

  modal: {
    width: 340,
    background: "#232838",
    border: "1px solid #3a4158",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },

  header: {
    padding: "14px 20px 0",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  title: {
    fontSize: 13,
    fontWeight: 500,
    color: "#e8eaf0",
    letterSpacing: "0.01em",
  },

  body: {
    padding: "16px 20px 20px",
  },

  labelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },

  label: {
    fontSize: 11,
    color: "#8a8fa8",
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
  },

  tag: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: 4,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },

  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  input: {
    flex: 1,
    height: 40,
    background: "#1a1f2e",
    border: "1px solid #3a4158",
    borderRadius: 8,
    padding: "0 14px",
    fontSize: 16,
    fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
    color: "#e8eaf0",
    outline: "none",
    transition: "border-color 0.15s ease",
    WebkitAppearance: "none" as CSSProperties["WebkitAppearance"],
    MozAppearance: "textfield" as CSSProperties["MozAppearance"],
  },

  unit: {
    fontSize: 13,
    color: "#5a6078",
    fontWeight: 500,
    letterSpacing: "0.02em",
    userSelect: "none" as const,
  },

  hint: {
    fontSize: 11,
    color: "#5a6078",
    marginTop: 8,
    lineHeight: 1.4,
  },

  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "0 20px 16px",
    flexShrink: 0,
  },

  btnCancel: {
    height: 34,
    padding: "0 18px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: "transparent",
    color: "#8a8fa8",
    border: "1px solid #3a4158",
    transition: "all 0.12s ease",
  },

  btnOk: {
    height: 34,
    padding: "0 18px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    color: "#1a1f2e",
    border: "none",
    transition: "all 0.12s ease",
  },
};
