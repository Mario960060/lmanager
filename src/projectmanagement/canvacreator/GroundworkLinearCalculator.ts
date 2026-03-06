// ══════════════════════════════════════════════════════════════
// GroundworkLinearCalculator — shared computation for linear groundwork
// ══════════════════════════════════════════════════════════════

export type GroundworkElementType = "drainage" | "canalPipe" | "waterPipe" | "cable";

const HOURS_PER_M_MANUAL = 0.4;
const HOURS_PER_M_MACHINERY = 0.08;
const DRAINAGE_GRAVEL_PER_M_T = 0.05;

const TASK_NAMES: Record<GroundworkElementType, { manual: string; machinery: string }> = {
  drainage: { manual: "drainage pipe installation (manual)", machinery: "drainage pipe installation (machinery)" },
  canalPipe: { manual: "PVC sewer pipe installation (manual)", machinery: "PVC sewer pipe installation (machinery)" },
  waterPipe: { manual: "water pipe installation (manual)", machinery: "water pipe installation (machinery)" },
  cable: { manual: "underground cable installation (manual)", machinery: "underground cable installation (machinery)" },
};

const ELEMENT_LABELS: Record<GroundworkElementType, string> = {
  drainage: "Drainage",
  canalPipe: "Canal Pipe",
  waterPipe: "Water Pipe",
  cable: "Cable",
};

/** Derive foundation digging method from excavator size. < 0.05t = manual (shovel), >= 0.05t = machinery (small/medium/large). */
export function getFoundationDiggingMethodFromExcavator(
  selectedExcavator?: { "size (in tones)"?: number } | null
): "shovel" | "small" | "medium" | "large" {
  const size = selectedExcavator?.["size (in tones)"] ?? 0;
  if (size < 0.05) return "shovel";
  if (size < 3) return "small";
  if (size < 7) return "medium";
  return "large";
}

export function isManualExcavation(
  foundationDiggingMethod?: "shovel" | "small" | "medium" | "large",
  selectedExcavator?: { "size (in tones)"?: number } | null
): boolean {
  if (foundationDiggingMethod === "shovel") return true;
  const size = selectedExcavator?.["size (in tones)"] ?? 0;
  return size < 0.05;
}

export interface GroundworkLinearResults {
  name: string;
  amount: number;
  unit: string;
  hours_worked: number;
  materials: { name: string; quantity: number; unit: string; price_per_unit?: number | null; total_price?: number | null }[];
  taskBreakdown: {
    task: string;
    hours: number;
    amount: number;
    unit: string;
    event_task_id?: string | null;
  }[];
}

export function computeGroundworkLinearResults(params: {
  lengthM: number;
  elementType: GroundworkElementType;
  isManual: boolean;
}): GroundworkLinearResults {
  const { lengthM, elementType, isManual } = params;
  const hoursPerM = isManual ? HOURS_PER_M_MANUAL : HOURS_PER_M_MACHINERY;
  const totalHours = lengthM * hoursPerM;
  const taskNames = TASK_NAMES[elementType];
  const taskName = isManual ? taskNames.manual : taskNames.machinery;
  const label = ELEMENT_LABELS[elementType];

  const taskBreakdown = [
    {
      task: taskName,
      hours: totalHours,
      amount: lengthM,
      unit: "m",
    },
  ];

  const materials: GroundworkLinearResults["materials"] = [];

  switch (elementType) {
    case "drainage":
      materials.push({ name: "drainage pipe", quantity: lengthM, unit: "m" });
      materials.push({ name: "drainage gravel", quantity: lengthM * DRAINAGE_GRAVEL_PER_M_T, unit: "t" });
      break;
    case "canalPipe":
      materials.push({ name: "PVC pipe", quantity: lengthM, unit: "m" });
      break;
    case "waterPipe":
      materials.push({ name: "water pipe", quantity: lengthM, unit: "m" });
      break;
    case "cable":
      materials.push({ name: "underground cable", quantity: lengthM, unit: "m" });
      break;
  }

  return {
    name: label,
    amount: lengthM,
    unit: "metres",
    hours_worked: totalHours,
    materials,
    taskBreakdown,
  };
}
