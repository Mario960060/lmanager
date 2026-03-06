// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — types.ts
// Phase 2 types: calculator results, auto-fill, project settings
// ══════════════════════════════════════════════════════════════

export interface CalculatorResultsMaster {
  name: string;
  amount: number | string;
  unit: string;
  hours_worked: number;
  materials: { name: string; quantity: number; unit: string }[];
  taskBreakdown: {
    task: string;
    hours: number;
    amount: number | string;
    unit: string;
    event_task_id?: string | null;
  }[];
  excavationTime?: number;
  transportTime?: number;
  totalTime?: number;
  totalTons?: number;
}

export interface AutoFillData {
  areaM2?: number;
  perimeterM?: number;
  totalLengthM?: number;
  boundingBoxLengthM?: number;
  boundingBoxWidthM?: number;
  edgeLengthsM?: number[];
  cornerCount?: number;
  segmentCount?: number;
}

export interface ProjectSettings {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: "planned" | "scheduled" | "in_progress";
  selectedExcavator: any | null;
  selectedCarrier: any | null;
  selectedMaterialCarrier: any | null;
  selectedCompactor: any | null;
  calculateTransport: boolean;
  transportDistance: string;
  /** Soil type for excavation tonnage (clay/sand/rock) */
  soilType: "" | "clay" | "sand" | "rock";
  /** Digging method for foundation excavation (from Equipment tab) */
  foundationDiggingMethod: "" | "shovel" | "small" | "medium" | "large";
  /** Material for pre-preparation leveling when terrain is too low */
  levelingMaterial: "" | "tape1" | "soil";
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  title: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "planned",
  selectedExcavator: null,
  selectedCarrier: null,
  selectedMaterialCarrier: null,
  selectedCompactor: null,
  calculateTransport: false,
  transportDistance: "",
  soilType: "",
  foundationDiggingMethod: "",
  levelingMaterial: "",
};
