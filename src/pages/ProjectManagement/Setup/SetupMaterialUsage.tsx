import React, { useState, useCallback, useEffect, useMemo } from "react";
import Modal from "../../../components/Modal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { translateMaterialName } from "../../../lib/translationMap";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../lib/store";
import {
  getMaterialUsageDefaults,
  saveMaterialUsageDefaults,
  type MaterialUsageDefaults,
} from "../../../lib/materialUsageDefaults";
import PageInfoModal from "../../../components/PageInfoModal";
import { colors, fonts, fontSizes, fontWeights, spacing, radii, transitions, gradients, shadows } from "../../../themes/designTokens";
import { SectionHeader } from "../../../themes/uiComponents";

const SAND_OPTION_KEYS = ["form:material_usage_sand_granite", "form:material_usage_sand_building", "form:material_usage_sand_sharp"] as const;
const SAND_OPTIONS_RAW = ["Granite Sand", "Building sand", "Sharp Sand"] as const;

/** Loose aggregate sand (building / sharp / granite sand). Excludes paving slabs whose names contain "sand" as part of "sandstone". */
function isLooseSandMaterialName(name: string): boolean {
  const n = name.toLowerCase();
  if (!n.includes("sand")) return false;
  if (n.includes("sandstone")) return false;
  return true;
}
const MORTAR_RATIOS = ["1:3", "1:4", "1:5", "1:6"];

const CALCULATORS = [
  {
    key: "paving_calculator",
    labelKey: "form:material_usage_calc_paving",
    icon: "⬡",
    color: "#f59e0b",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", labelKey: "form:material_usage_sand_thickness", unit: "cm", default: 5 },
      { key: "monoblock_height", labelKey: "form:material_usage_monoblock_height", unit: "cm", default: 6 },
    ],
    hasSand: true,
    supabaseId: "paving",
  },
  {
    key: "slab_calculator",
    labelKey: "form:material_usage_calc_slabs",
    icon: "◫",
    color: "#8b5cf6",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "mortar_thickness", labelKey: "form:material_usage_mortar_thickness", unit: "cm", default: 3 },
      { key: "slab_thickness", labelKey: "form:material_usage_slab_thickness", unit: "cm", default: 2 },
    ],
    hasSand: true,
    supabaseId: "slab",
  },
  {
    key: "concrete_slabs_calculator",
    labelKey: "form:material_usage_calc_concrete_slabs",
    icon: "▣",
    color: "#6b7280",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", labelKey: "form:material_usage_sand_thickness", unit: "cm", default: 5 },
      { key: "concrete_slab_thickness", labelKey: "form:material_usage_concrete_slab_thickness", unit: "cm", default: 6 },
    ],
    hasSand: true,
    supabaseId: "concrete_slabs",
  },
  {
    key: "artificial_grass_calculator",
    labelKey: "form:material_usage_calc_artificial_grass",
    icon: "▤",
    color: "#22c55e",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "sand_thickness", labelKey: "form:material_usage_sand_thickness", unit: "cm", default: 5 },
    ],
    hasSand: true,
    supabaseId: "artificial_grass",
  },
  {
    key: "natural_turf_calculator",
    labelKey: "form:material_usage_calc_natural_turf",
    icon: "🌿",
    color: "#16a34a",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "soil_thickness", labelKey: "form:material_usage_soil_thickness", unit: "cm", default: 5 },
    ],
    hasSand: false,
    supabaseId: "natural_turf",
  },
  {
    key: "decorative_stones_calculator",
    labelKey: "form:material_usage_calc_decorative_stones",
    icon: "◆",
    color: "#a78bfa",
    thicknesses: [
      { key: "type1_thickness", labelKey: "form:material_usage_type1_thickness", unit: "cm", default: 10 },
      { key: "decorative_stones_depth", labelKey: "form:material_usage_decorative_stones_depth", unit: "cm", default: 5 },
    ],
    hasSand: false,
    supabaseId: "decorative_stones",
  },
  {
    key: "wall_calculator",
    labelKey: "form:material_usage_calc_walls",
    icon: "▦",
    color: "#ef4444",
    thicknesses: [],
    hasSand: true,
    supabaseId: "wall",
  },
];

const MORTAR_CONFIG = [
  { key: "slab_mortar", labelKey: "form:material_usage_slab_mortar_mix", subtitleKey: "form:material_usage_cement_sand", default: "1:5", supabaseType: "slab" },
  { key: "brick_mortar", labelKey: "form:material_usage_brick_mortar_mix", subtitleKey: "form:material_usage_cement_sand", default: "1:4", supabaseType: "brick" },
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
  options: string[] | { value: string; label: string }[];
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div style={{ position: "relative", ...style }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: `${spacing.md}px 32px ${spacing.md}px ${spacing.xl}px`,
          background: colors.bgElevated,
          border: `1px solid ${colors.borderHover}`,
          borderRadius: radii.lg,
          color: colors.textSecondary,
          fontSize: fontSizes.base,
          fontFamily: fonts.body,
          appearance: "none",
          cursor: "pointer",
          outline: "none",
          transition: transitions.fast,
        }}
        onFocus={(e) => (e.target.style.borderColor = colors.borderInputFocus)}
        onBlur={(e) => (e.target.style.borderColor = colors.borderHover)}
      >
        {opts.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div
        style={{
          position: "absolute",
          right: spacing.lg,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: colors.textDim,
          fontSize: fontSizes.xs,
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
        background: colors.bgElevated,
        border: `1px solid ${colors.borderHover}`,
        borderRadius: radii.lg,
        overflow: "hidden",
        transition: transitions.fast,
      }}
    >
      <input
        type="number"
        value={value}
        placeholder={placeholder || "0"}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: `${spacing.md}px ${spacing.xl}px`,
          background: "transparent",
          border: "none",
          color: colors.textSecondary,
          fontSize: fontSizes.base,
          fontFamily: fonts.body,
          outline: "none",
          width: 60,
          minWidth: 0,
        }}
      />
      <span
        style={{
          padding: `${spacing.md}px ${spacing.lg}px`,
          color: colors.textDim,
          fontSize: fontSizes.sm,
          borderLeft: `1px solid ${colors.borderDefault}`,
          background: colors.bgSubtle,
          fontFamily: fonts.body,
        }}
      >
        {unit}
      </span>
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
  if (!materialId) return SAND_OPTIONS_RAW[0];
  const m = materials.find((x) => x.id === materialId);
  if (!m) return SAND_OPTIONS_RAW[0];
  if (!isLooseSandMaterialName(m.name)) return SAND_OPTIONS_RAW[0];
  const match = SAND_OPTIONS_RAW.find((opt) => opt.toLowerCase() === m.name.toLowerCase());
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
    () => materials.filter((m) => isLooseSandMaterialName(m.name)),
    [materials]
  );

  const getSandDropdownOptions = useCallback(
    (calcKey: string): { value: string; label: string }[] => {
      const value = sandConfig[calcKey] || SAND_OPTIONS_RAW[0];
      const base =
        sandMaterials.length > 0
          ? sandMaterials.map((m) => ({ value: m.name, label: translateMaterialName(m.name, t) }))
          : SAND_OPTIONS_RAW.map((raw, i) => ({ value: raw, label: t(SAND_OPTION_KEYS[i]) }));
      if (value && !base.some((o) => o.value === value)) {
        return [{ value, label: translateMaterialName(value, t) }, ...base];
      }
      return base;
    },
    [sandMaterials, sandConfig, t]
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
      const idsFromSave = config.map((c) => c.calculator_id);
      // decorative_stones is not configured here (no sand); remove stale row from when it was saved as sand.
      const idsToDelete = [...new Set([...idsFromSave, "decorative_stones"])];
      await supabase
        .from("material_usage_configs")
        .delete()
        .in("calculator_id", idsToDelete)
        .eq("company_id", companyId);
      const toInsert = config.map((c) => ({ ...c, company_id: companyId }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("material_usage_configs").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materialUsageConfigs", companyId] });
      queryClient.invalidateQueries({ queryKey: ["materialUsageConfig"] });
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
      const sandName = sandConfig[calc.key] || SAND_OPTIONS_RAW[0];
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
      saveConfigMutation.mutate(configToSave, {
        onSuccess: saveMortar,
        onError: () => setSaving(false),
      });
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
        fontFamily: fonts.body,
        background: colors.bgMain,
        minHeight: "100vh",
        padding: 0,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div className="setup-material-usage-inner" style={{ maxWidth: 640, margin: "0 auto", padding: `${spacing["6xl"]}px ${spacing["3xl"]}px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: spacing["7xl"] }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
            <h1
              style={{
                margin: 0,
                fontSize: fontSizes.xl,
                fontWeight: fontWeights.bold,
                color: colors.textPrimary,
                fontFamily: fonts.display,
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
            title={t("form:material_usage_close_button")}
            aria-label={t("form:material_usage_close_button")}
            style={{
              background: "transparent",
              border: "none",
              color: colors.textDim,
              fontSize: fontSizes["2xl"],
              cursor: saving ? "wait" : "pointer",
              padding: spacing.xs,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <SectionHeader title={t("form:default_thicknesses_title")} subtitle={t("form:default_thicknesses_subtitle")} />

        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xl, marginBottom: spacing["7xl"] }}>
          {CALCULATORS.filter((c) => c.thicknesses.length > 0).map((calc) => (
            <div
              key={calc.key}
              style={{
                background: colors.bgCardInner,
                borderRadius: radii["2xl"],
                border: `1px solid ${colors.borderDefault}`,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setActiveTab(activeTab === calc.key ? null : calc.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.lg,
                  padding: `${spacing["2xl"]}px ${spacing["3xl"]}px`,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: transitions.fast,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSubtle)}
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
                    fontSize: fontSizes.md,
                    fontWeight: fontWeights.semibold,
                    color: colors.textSecondary,
                    fontFamily: fonts.display,
                    letterSpacing: "0.3px",
                  }}
                >
                  {t(calc.labelKey)}
                </span>
                <div style={{ display: "flex", gap: spacing.sm, alignItems: "center", marginRight: spacing.md }}>
                  {calc.thicknesses.map((thick) => (
                    <span
                      key={thick.key}
                      style={{
                        padding: `${spacing.xs / 2}px ${spacing.md}px`,
                        background: colors.bgOverlay,
                        borderRadius: radii.sm,
                        fontSize: fontSizes.sm,
                        color: colors.textSubtle,
                        fontFamily: fonts.body,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {thicknessConfig[calc.key]?.[thick.key] ?? thick.default} {thick.unit}
                    </span>
                  ))}
                </div>
                <span
                  style={{
                    color: colors.textFaint,
                    fontSize: fontSizes.sm,
                    transition: transitions.normal,
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
                    padding: `0 ${spacing["3xl"]}px ${spacing["3xl"]}px`,
                    display: "grid",
                    gridTemplateColumns: calc.thicknesses.length <= 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                    gap: spacing.xl,
                    alignItems: "end",
                  }}
                >
                  {calc.thicknesses.map((thick) => (
                    <div key={thick.key}>
                      <label
                        style={{
                          display: "block",
                          fontSize: fontSizes.sm,
                          color: colors.textDim,
                          marginBottom: spacing.sm,
                          fontFamily: fonts.body,
                          fontWeight: fontWeights.medium,
                        }}
                      >
                        {t(thick.labelKey)}
                      </label>
                      <NumberInput
                        value={thicknessConfig[calc.key]?.[thick.key] ?? ""}
                        onChange={(v) => handleThicknessChange(calc.key, thick.key, v)}
                        unit={thick.unit}
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
            background: colors.bgCardInner,
            borderRadius: radii["2xl"],
            border: `1px solid ${colors.borderDefault}`,
            overflow: "hidden",
            marginBottom: spacing["7xl"],
          }}
        >
          {CALCULATORS.filter((c) => c.hasSand).map((calc, i, arr) => (
            <div
              key={calc.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.lg,
                padding: `${spacing.xl}px ${spacing["3xl"]}px`,
                borderBottom: i < arr.length - 1 ? `1px solid ${colors.borderLight}` : "none",
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
                  fontSize: fontSizes.base,
                  fontWeight: fontWeights.semibold,
                  color: colors.textMuted,
                  fontFamily: fonts.display,
                  letterSpacing: "0.3px",
                }}
              >
                {t(calc.labelKey)}
              </span>
              <SelectDropdown
                value={sandConfig[calc.key] || SAND_OPTIONS_RAW[0]}
                options={getSandDropdownOptions(calc.key)}
                onChange={(v) => setSandConfig((prev) => ({ ...prev, [calc.key]: v }))}
                style={{ width: 160 }}
              />
            </div>
          ))}
        </div>

        <SectionHeader title={t("form:mortar_mix_ratio_title")} subtitle={t("form:mortar_mix_ratio_subtitle")} />

        <div
          style={{
            background: colors.bgCardInner,
            borderRadius: radii["2xl"],
            border: `1px solid ${colors.borderDefault}`,
            overflow: "hidden",
            marginBottom: spacing["8xl"],
          }}
        >
          {MORTAR_CONFIG.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.xl,
                padding: `${spacing.xl}px ${spacing["3xl"]}px`,
                borderBottom: i < MORTAR_CONFIG.length - 1 ? `1px solid ${colors.borderLight}` : "none",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: fontSizes.base,
                    fontWeight: fontWeights.semibold,
                    color: colors.textMuted,
                    fontFamily: fonts.display,
                    letterSpacing: "0.3px",
                  }}
                >
                  {t(item.labelKey)}
                </div>
                <div style={{ fontSize: fontSizes.sm, color: colors.textFaint, fontFamily: fonts.body }}>
                  {t(item.subtitleKey)}
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: spacing.xl }}>
          <button
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: `${spacing.lg}px ${spacing["6xl"]}px`,
              background: "transparent",
              border: `1px solid ${colors.borderHover}`,
              borderRadius: radii.lg,
              color: colors.textSubtle,
              fontSize: fontSizes.md,
              fontWeight: fontWeights.semibold,
              fontFamily: fonts.display,
              cursor: "pointer",
              letterSpacing: "0.3px",
              transition: transitions.fast,
            }}
          >
            {t("form:material_usage_close_button")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: `${spacing.lg}px ${spacing["7xl"]}px`,
              background: saving ? gradients.greenSave : gradients.bluePrimary,
              border: "none",
              borderRadius: radii.lg,
              color: colors.textOnAccent,
              fontSize: fontSizes.md,
              fontWeight: fontWeights.bold,
              fontFamily: fonts.display,
              cursor: saving ? "wait" : "pointer",
              letterSpacing: "0.5px",
              transition: transitions.slow,
              boxShadow: shadows.blue,
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
      <div style={{ padding: spacing["6xl"] }}>
        <p style={{ color: colors.red }}>{t("form:no_company_selected")}</p>
      </div>
    );
    if (wizardMode) return <div style={{ padding: spacing["6xl"] }}>{errorContent}</div>;
    return (
      <Modal isOpen={true} onClose={onClose} title={t("form:material_usage_setup_modal_title")}>
        {errorContent}
      </Modal>
    );
  }

  if (wizardMode) {
    return <div style={{ overflowY: "auto", height: "100%" }}>{content}</div>;
  }

  return (
    <Modal isOpen={true} onClose={handleClose} title={t("form:material_usage_setup_modal_title")}>
      {content}
    </Modal>
  );
};

export default SetupMaterialUsage;
