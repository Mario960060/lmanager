import React, { useState, useCallback, useEffect, useMemo } from "react";
import Modal from "../../../components/Modal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import {
  getMaterialUsageDefaults,
  saveMaterialUsageDefaults,
  type MaterialUsageDefaults,
} from "../../../lib/materialUsageDefaults";
import PageInfoModal from "../../../components/PageInfoModal";

const SAND_OPTIONS = ["Granite Sand", "Building sand", "Sharp Sand"];
const MORTAR_RATIOS = ["1:3", "1:4", "1:5", "1:6"];

const CALCULATORS = [
  {
    key: "paving_calculator",
    label: "Paving",
    icon: "⬡",
    color: "#f59e0b",
    thicknesses: [
      { key: "type1_thickness", label: "Type 1 Thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", label: "Sand Thickness", unit: "cm", default: 5 },
      { key: "monoblock_height", label: "Monoblock Height", unit: "cm", default: 6 },
    ],
    hasSand: true,
    supabaseId: "paving",
  },
  {
    key: "slab_calculator",
    label: "Slabs",
    icon: "◫",
    color: "#8b5cf6",
    thicknesses: [
      { key: "type1_thickness", label: "Type 1 Thickness", unit: "cm", default: 10 },
      { key: "mortar_thickness", label: "Mortar Thickness", unit: "cm", default: 3 },
      { key: "slab_thickness", label: "Slab Thickness", unit: "cm", default: 2 },
    ],
    hasSand: true,
    supabaseId: "slab",
  },
  {
    key: "concrete_slabs_calculator",
    label: "Concrete Slabs",
    icon: "▣",
    color: "#6b7280",
    thicknesses: [
      { key: "type1_thickness", label: "Type 1 Thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", label: "Sand Thickness", unit: "cm", default: 5 },
      { key: "concrete_slab_thickness", label: "Concrete Slab Thickness", unit: "cm", default: 6 },
    ],
    hasSand: true,
    supabaseId: "concrete_slabs",
  },
  {
    key: "artificial_grass_calculator",
    label: "Artificial Grass",
    icon: "▤",
    color: "#22c55e",
    thicknesses: [
      { key: "type1_thickness", label: "Type 1 Thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", label: "Sand Thickness", unit: "cm", default: 5 },
    ],
    hasSand: true,
    supabaseId: "artificial_grass",
  },
  {
    key: "wall_calculator",
    label: "Walls",
    icon: "▦",
    color: "#ef4444",
    thicknesses: [],
    hasSand: true,
    supabaseId: "wall",
  },
];

const MORTAR_CONFIG = [
  { key: "slab_mortar", label: "Slab Mortar Mix", subtitle: "Cement : Sand", default: "1:5", supabaseType: "slab" },
  { key: "brick_mortar", label: "Brick/Block Mortar Mix", subtitle: "Cement : Sand", default: "1:4", supabaseType: "brick" },
];

const EMPTY_CONFIGS: MaterialUsageConfig[] = [];
const EMPTY_MORTAR: Record<string, { mortar_mix_ratio: string }> = {};
const EMPTY_THICKNESS_ROWS: { calculator_id: string; thickness_key: string; value: number }[] = [];

interface SetupMaterialUsageProps {
  onClose: () => void;
  wizardMode?: boolean;
}

interface Material {
  id: string;
  name: string;
  type: string;
}

interface MaterialUsageConfig {
  calculator_id: string;
  material_id?: string;
  company_id: string;
}

const EMPTY_MATERIALS: Material[] = [];

function SelectDropdown({
  value,
  options,
  onChange,
  style,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: "relative", ...style }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 32px 8px 12px",
          background: "#1e293b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          color: "#e2e8f0",
          fontSize: 13,
          fontFamily: "'Exo 2', sans-serif",
          appearance: "none",
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(139,92,246,0.5)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <div
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "#64748b",
          fontSize: 10,
        }}
      >
        ▼
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  unit,
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#1e293b",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      <input
        type="number"
        value={value}
        placeholder={placeholder || "0"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          color: "#e2e8f0",
          fontSize: 13,
          fontFamily: "'Exo 2', sans-serif",
          outline: "none",
          width: 60,
          minWidth: 0,
        }}
      />
      <span
        style={{
          padding: "8px 10px",
          color: "#64748b",
          fontSize: 12,
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          fontFamily: "'Exo 2', sans-serif",
        }}
      >
        {unit}
      </span>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 700,
          color: "#e2e8f0",
          fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            margin: "2px 0 0",
            fontSize: 12,
            color: "#475569",
            fontFamily: "'Exo 2', sans-serif",
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Find material ID by name (case-insensitive, partial match) */
function findMaterialIdByName(materials: Material[], sandName: string): string | null {
  const lower = sandName.toLowerCase();
  const exact = materials.find((m) => m.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = materials.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()));
  return partial?.id ?? null;
}

/** Find sand name from material ID */
function getSandNameFromMaterialId(materials: Material[], materialId: string | undefined): string {
  if (!materialId) return SAND_OPTIONS[0];
  const m = materials.find((x) => x.id === materialId);
  if (!m) return SAND_OPTIONS[0];
  const match = SAND_OPTIONS.find((opt) => opt.toLowerCase() === m.name.toLowerCase());
  if (match) return match;
  return m.name;
}

const SetupMaterialUsage: React.FC<SetupMaterialUsageProps> = ({ onClose, wizardMode = false }) => {
  const { t } = useTranslation(["common", "form", "utilities"]);
  const companyId = useAuthStore((s) => s.getCompanyId());
  const queryClient = useQueryClient();

  const [sandConfig, setSandConfig] = useState<Record<string, string>>({
    wall_calculator: "Building sand",
    slab_calculator: "Granite Sand",
    artificial_grass_calculator: "Granite Sand",
    paving_calculator: "Granite Sand",
  });

  const [thicknessConfig, setThicknessConfig] = useState<Record<string, Record<string, number>>>(() => {
    const config: Record<string, Record<string, number>> = {};
    CALCULATORS.forEach((calc) => {
      config[calc.key] = {};
      calc.thicknesses.forEach((t) => {
        config[calc.key][t.key] = t.default;
      });
    });
    return config;
  });

  const [mortarConfig, setMortarConfig] = useState<Record<string, string>>({
    slab_mortar: "1:5",
    brick_mortar: "1:4",
  });

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: materialsData } = useQuery<Material[]>({
    queryKey: ["materials", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Material[];
    },
    enabled: !!companyId,
  });

  const materials = materialsData ?? EMPTY_MATERIALS;

  const { data: existingConfigsData } = useQuery<MaterialUsageConfig[]>({
    queryKey: ["materialUsageConfigs", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("material_usage_configs")
        .select("calculator_id, material_id, company_id")
        .eq("company_id", companyId);
      if (error) throw error;
      return data as MaterialUsageConfig[];
    },
    enabled: !!companyId,
  });

  const existingConfigs = existingConfigsData ?? EMPTY_CONFIGS;

  const { data: mortarMixRatiosData } = useQuery<Record<string, { mortar_mix_ratio: string }>>({
    queryKey: ["mortarMixRatios", companyId],
    queryFn: async () => {
      if (!companyId) return {};
      const { data, error } = await supabase
        .from("mortar_mix_ratios")
        .select("type, mortar_mix_ratio")
        .eq("company_id", companyId);
      if (error && error.code !== "PGRST116") throw error;
      const out: Record<string, { mortar_mix_ratio: string }> = {};
      (data || []).forEach((item: { type: string; mortar_mix_ratio: string }) => {
        out[item.type] = { mortar_mix_ratio: item.mortar_mix_ratio };
      });
      return out;
    },
    enabled: !!companyId,
  });

  const mortarMixRatios = mortarMixRatiosData ?? EMPTY_MORTAR;

  const { data: thicknessDefaultsData } = useQuery<{ calculator_id: string; thickness_key: string; value: number }[]>({
    queryKey: ["materialUsageThicknessDefaults", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("material_usage_thickness_defaults")
        .select("calculator_id, thickness_key, value")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data || []) as { calculator_id: string; thickness_key: string; value: number }[];
    },
    enabled: !!companyId,
  });

  const thicknessDefaultsRows = thicknessDefaultsData ?? EMPTY_THICKNESS_ROWS;

  const sandMaterials = useMemo(
    () => materials.filter((m) => m.name.toLowerCase().includes("sand")),
    [materials]
  );

  const supabaseIdToCalcKey: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    CALCULATORS.forEach((c) => {
      m[c.supabaseId] = c.key;
    });
    return m;
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const stored = getMaterialUsageDefaults(companyId);
    let thickness: Record<string, Record<string, number>> = { ...stored.thicknessConfig };
    if (thicknessDefaultsRows.length > 0) {
      thicknessDefaultsRows.forEach((row) => {
        const calcKey = supabaseIdToCalcKey[row.calculator_id];
        if (calcKey) {
          if (!thickness[calcKey]) thickness[calcKey] = {};
          thickness[calcKey][row.thickness_key] = Number(row.value);
        }
      });
      saveMaterialUsageDefaults(companyId, { ...stored, thicknessConfig: thickness });
    }
    setThicknessConfig(thickness);
    const sand: Record<string, string> = { ...stored.sandConfig };
    const mortar: Record<string, string> = { ...stored.mortarConfig };
    existingConfigs.forEach((c) => {
      const calc = CALCULATORS.find((x) => x.supabaseId === c.calculator_id);
      if (calc && c.material_id) {
        sand[calc.key] = getSandNameFromMaterialId(materials, c.material_id);
      }
    });
    if (mortarMixRatios.slab?.mortar_mix_ratio) mortar.slab_mortar = mortarMixRatios.slab.mortar_mix_ratio;
    if (mortarMixRatios.brick?.mortar_mix_ratio) mortar.brick_mortar = mortarMixRatios.brick.mortar_mix_ratio;
    setSandConfig(sand);
    setMortarConfig(mortar);
  }, [companyId, existingConfigs, materials, mortarMixRatios, thicknessDefaultsRows, supabaseIdToCalcKey]);

  const handleThicknessChange = useCallback((calcKey: string, fieldKey: string, value: string) => {
    const num = value === "" ? 0 : parseFloat(value);
    setThicknessConfig((prev) => ({
      ...prev,
      [calcKey]: { ...prev[calcKey], [fieldKey]: isNaN(num) ? 0 : num },
    }));
  }, []);

  const saveConfigMutation = useMutation({
    mutationFn: async (config: MaterialUsageConfig[]) => {
      if (!companyId) throw new Error(t("form:company_id_required"));
      const ids = config.map((c) => c.calculator_id);
      await supabase
        .from("material_usage_configs")
        .delete()
        .in("calculator_id", ids)
        .eq("company_id", companyId);
      const toInsert = config.map((c) => ({ ...c, company_id: companyId }));
      const { error } = await supabase.from("material_usage_configs").insert(toInsert);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialUsageConfigs", companyId] });
    },
  });

  const saveMortarMutation = useMutation({
    mutationFn: async (ratios: { type: string; ratio: string }[]) => {
      if (!companyId) throw new Error(t("form:company_id_required"));
      for (const item of ratios) {
        const { data: existing } = await supabase
          .from("mortar_mix_ratios")
          .select("id")
          .eq("company_id", companyId)
          .eq("type", item.type)
          .single();
        if (existing) {
          await supabase
            .from("mortar_mix_ratios")
            .update({ mortar_mix_ratio: item.ratio })
            .eq("company_id", companyId)
            .eq("type", item.type);
        } else {
          await supabase
            .from("mortar_mix_ratios")
            .insert([{ company_id: companyId, type: item.type, mortar_mix_ratio: item.ratio }]);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mortarMixRatios", companyId] });
    },
  });

  const saveThicknessMutation = useMutation({
    mutationFn: async (thickness: Record<string, Record<string, number>>) => {
      if (!companyId) throw new Error(t("form:company_id_required"));
      const calculatorIds = CALCULATORS.filter((c) => c.thicknesses.length > 0).map((c) => c.supabaseId);
      if (calculatorIds.length === 0) return;
      await supabase
        .from("material_usage_thickness_defaults")
        .delete()
        .eq("company_id", companyId)
        .in("calculator_id", calculatorIds);
      const toInsert: { company_id: string; calculator_id: string; thickness_key: string; value: number }[] = [];
      CALCULATORS.filter((c) => c.thicknesses.length > 0).forEach((calc) => {
        const vals = thickness[calc.key];
        if (vals) {
          calc.thicknesses.forEach((t) => {
            const v = vals[t.key];
            if (v != null && !Number.isNaN(v)) {
              toInsert.push({
                company_id: companyId,
                calculator_id: calc.supabaseId,
                thickness_key: t.key,
                value: Number(v),
              });
            }
          });
        }
      });
      if (toInsert.length > 0) {
        const { error } = await supabase.from("material_usage_thickness_defaults").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialUsageThicknessDefaults", companyId] });
    },
  });

  const handleSave = useCallback(() => {
    if (!companyId) return;
    if (saving) return;
    setSaving(true);

    const defaults: MaterialUsageDefaults = {
      thicknessConfig,
      sandConfig,
      mortarConfig,
    };
    saveMaterialUsageDefaults(companyId, defaults);

    const configToSave: MaterialUsageConfig[] = [];
    CALCULATORS.filter((c) => c.hasSand).forEach((calc) => {
      const sandName = sandConfig[calc.key] || SAND_OPTIONS[0];
      const materialId = findMaterialIdByName(sandMaterials, sandName);
      if (materialId) {
        configToSave.push({
          calculator_id: calc.supabaseId,
          material_id: materialId,
          company_id: companyId,
        });
      }
    });

    const doClose = () => {
      setSaving(false);
      setTimeout(() => onClose(), 400);
    };

    const saveMortar = () => {
      saveMortarMutation.mutate(
        [
          { type: "slab", ratio: mortarConfig.slab_mortar },
          { type: "brick", ratio: mortarConfig.brick_mortar },
        ],
        {
          onSettled: doClose,
          onError: () => setSaving(false),
        }
      );
    };

    const saveConfigAndMortar = () => {
      if (configToSave.length > 0) {
        saveConfigMutation.mutate(configToSave, {
          onSuccess: saveMortar,
          onError: () => setSaving(false),
        });
      } else {
        saveMortar();
      }
    };

    saveThicknessMutation.mutate(thicknessConfig, {
      onSuccess: saveConfigAndMortar,
      onError: () => setSaving(false),
    });
  }, [
    companyId,
    thicknessConfig,
    sandConfig,
    mortarConfig,
    sandMaterials,
    saveConfigMutation,
    saveMortarMutation,
    saveThicknessMutation,
    saving,
    onClose,
    t,
  ]);

  const handleClose = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const aboutDescription = t("form:material_usage_about_description");

  const content = (
    <div
      style={{
        fontFamily: "'Exo 2', 'Rajdhani', sans-serif",
        background: "#0f172a",
        minHeight: "100vh",
        padding: 0,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: "#f1f5f9",
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: "0.5px",
              }}
            >
              {t("form:material_usage_setup_page_title")}
            </h1>
            <PageInfoModal
              title={t("form:setup_page_info_title")}
              description={aboutDescription}
              quickTips={[]}
            />
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 22,
              cursor: saving ? "wait" : "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <SectionHeader title={t("form:default_thicknesses_title")} subtitle={t("form:default_thicknesses_subtitle")} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {CALCULATORS.filter((c) => c.thicknesses.length > 0).map((calc) => (
            <div
              key={calc.key}
              style={{
                background: "#1a2332",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setActiveTab(activeTab === calc.key ? null : calc.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${calc.color}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {calc.icon}
                </span>
                <span
                  style={{
                    flex: 1,
                    textAlign: "left",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#e2e8f0",
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: "0.3px",
                  }}
                >
                  {calc.label}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginRight: 8 }}>
                  {calc.thicknesses.map((t) => (
                    <span
                      key={t.key}
                      style={{
                        padding: "2px 8px",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 4,
                        fontSize: 11,
                        color: "#94a3b8",
                        fontFamily: "'Exo 2', sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {thicknessConfig[calc.key]?.[t.key] ?? t.default} {t.unit}
                    </span>
                  ))}
                </div>
                <span
                  style={{
                    color: "#475569",
                    fontSize: 12,
                    transition: "transform 0.2s",
                    transform: activeTab === calc.key ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
              </button>

              <div
                style={{
                  maxHeight: activeTab === calc.key ? 300 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.25s ease",
                }}
              >
                <div
                  style={{
                    padding: "0 16px 16px",
                    display: "grid",
                    gridTemplateColumns: calc.thicknesses.length <= 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                    gap: 12,
                  }}
                >
                  {calc.thicknesses.map((t) => (
                    <div key={t.key}>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 5,
                          fontFamily: "'Exo 2', sans-serif",
                          fontWeight: 500,
                        }}
                      >
                        {t.label}
                      </label>
                      <NumberInput
                        value={thicknessConfig[calc.key]?.[t.key] ?? ""}
                        onChange={(v) => handleThicknessChange(calc.key, t.key, v)}
                        unit={t.unit}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <SectionHeader title={t("form:sand_usage_title")} subtitle={t("form:sand_usage_subtitle")} />

        <div
          style={{
            background: "#1a2332",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
            marginBottom: 28,
          }}
        >
          {CALCULATORS.filter((c) => c.hasSand).map((calc, i, arr) => (
            <div
              key={calc.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: `${calc.color}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {calc.icon}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#cbd5e1",
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: "0.3px",
                }}
              >
                {calc.label}
              </span>
              <SelectDropdown
                value={sandConfig[calc.key] || SAND_OPTIONS[0]}
                options={SAND_OPTIONS}
                onChange={(v) => setSandConfig((prev) => ({ ...prev, [calc.key]: v }))}
                style={{ width: 160 }}
              />
            </div>
          ))}
        </div>

        <SectionHeader title={t("form:mortar_mix_ratio_title")} subtitle={t("form:mortar_mix_ratio_subtitle")} />

        <div
          style={{
            background: "#1a2332",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
            marginBottom: 32,
          }}
        >
          {MORTAR_CONFIG.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: i < MORTAR_CONFIG.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#cbd5e1",
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: "0.3px",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Exo 2', sans-serif" }}>
                  {item.subtitle}
                </div>
              </div>
              <SelectDropdown
                value={mortarConfig[item.key] || item.default}
                options={MORTAR_RATIOS}
                onChange={(v) => setMortarConfig((prev) => ({ ...prev, [item.key]: v }))}
                style={{ width: 100 }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: "10px 24px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#94a3b8",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Rajdhani', sans-serif",
              cursor: "pointer",
              letterSpacing: "0.3px",
              transition: "all 0.15s",
            }}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 28px",
              background: saving
                ? "linear-gradient(135deg, #22c55e, #16a34a)"
                : "linear-gradient(135deg, #7c3aed, #6d28d9)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Rajdhani', sans-serif",
              cursor: saving ? "wait" : "pointer",
              letterSpacing: "0.5px",
              transition: "all 0.25s",
              boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
            }}
          >
            {saving ? t("form:saved") : t("form:save_changes")}
          </button>
        </div>
      </div>
    </div>
  );

  if (!companyId) {
    const errorContent = (
      <div className="p-6">
        <p className="text-red-600">{t("form:no_company_selected")}</p>
      </div>
    );
    if (wizardMode) return <div className="p-6">{errorContent}</div>;
    return (
      <Modal isOpen={true} onClose={onClose} title={t("form:material_usage_setup_modal_title")}>
        {errorContent}
      </Modal>
    );
  }

  if (wizardMode) {
    return <div className="overflow-y-auto h-full">{content}</div>;
  }

  return (
    <Modal isOpen={true} onClose={handleClose} title={t("form:material_usage_setup_modal_title")}>
      {content}
    </Modal>
  );
};

export default SetupMaterialUsage;
