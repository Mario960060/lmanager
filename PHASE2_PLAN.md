# Master Project — Phase 2 Mega Plan

> All UI text and code must be in **English**.
> Phase 2 builds on top of the existing Phase 1 CAD editor (MasterProject.tsx).

---

## Architecture Overview

### Current State (Phase 1 — Done)
- 2D CAD editor with canvas (MasterProject.tsx, geometry.ts, geodesy.ts)
- Two layers: Layer 1 (Garden outline), Layer 2 (Elements) — layer switching works
- Modes: select, freeDraw, scale, geodesy
- Shape insertion: square, rectangle, triangle, trapezoid
- Full editing: drag/insert/delete points, snap, locked edges/angles, rotation, scaling
- Dimensions: live lengths (m), angles (°), area (m²)
- Geodesy: height per point, slope calculations (cm/m)
- Separate form-based project creation (ProjectCreating.tsx) with calculator integration

### Phase 2 Goal
Turn the canvas editor into a **full project creation tool**. Each shape/element on Layer 2 gets an **Object Card** — a modal where the user picks a calculator type, fills in inputs (many auto-filled from canvas geometry), and gets task + material breakdowns. At the end, one "Create Project" button aggregates everything and saves to Supabase — identical output to ProjectCreating.tsx, but driven by the visual canvas.

### Two Element Categories

| Category | Drawing method | Examples | Canvas appearance |
|---|---|---|---|
| **Area elements** | Closed polygon (existing shapes) | Slabs, Paving, Artificial Grass, Deck, Steps, Turf | Filled polygon with area label |
| **Linear elements** | Polyline with thickness | Fence, Wall, Kerbs & Edges, Foundation | Thick line (~10cm rendered width) with segment lengths and corner angles |

---

## Data Model Changes

### Shape Interface Extension

```typescript
interface Shape {
  // ── Existing (Phase 1) ──
  points: Point[];
  closed: boolean;
  label: string;
  layer: LayerID;
  lockedEdges: { idx: number; len: number }[];
  lockedAngles: number[];
  heights: number[];

  // ── New (Phase 2) ──
  elementType: 'polygon' | 'fence' | 'wall' | 'kerb' | 'foundation';
  thickness?: number;           // meters — for linear elements (default 0.10 = 10cm)
  calculatorType?: string;      // e.g. 'slab', 'paving', 'grass', 'deck', 'steps', 'turf', 'fence', 'wall', 'kerbs', 'foundation'
  calculatorSubType?: string;   // e.g. 'vertical', 'brick', 'kl', 'l_shape'
  calculatorInputs?: Record<string, any>;  // user-entered inputs (persisted between edits)
  calculatorResults?: CalculatorResults;   // last calculated results
  objectCardOpen?: boolean;     // UI state — is the card modal open
}
```

### CalculatorResults (reuse existing)

```typescript
interface CalculatorResults {
  name: string;
  amount: number | string;
  unit: string;
  hours_worked: number;
  materials: { name: string; quantity: number; unit: string }[];
  taskBreakdown: { task: string; hours: number; amount: number | string; unit: string; event_task_id?: string | null }[];
  // ... excavation, transport fields as needed
}
```

### Global Project Settings (new state in MasterProject)

```typescript
interface ProjectSettings {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'scheduled' | 'in_progress';
  selectedExcavator: DiggingEquipment | null;
  selectedCarrier: DiggingEquipment | null;
  selectedCompactor: any | null;
  calculateTransport: boolean;
  transportDistance: string;
}
```

---

## Phase 2.0 — Core System

> The foundation: Layer 2 object cards, calculator integration, auto-fill, and project creation from canvas.

### Feature List

#### F1. Extended Shape Data Model
- Add `elementType`, `thickness`, `calculatorType`, `calculatorSubType`, `calculatorInputs`, `calculatorResults` to Shape interface
- Default `elementType: 'polygon'` for existing shapes
- Ensure backward compatibility with Phase 1 shapes (Layer 1 shapes don't need calculator data)
- Migrate geometry.ts Shape interface

#### F2. Linear Element Drawing Tools
New toolbar buttons (Layer 2 only):
- **"Draw Fence"** — enters `drawFence` mode
- **"Draw Wall"** — enters `drawWall` mode  
- **"Draw Kerbs"** — enters `drawKerb` mode
- **"Draw Foundation"** — enters `drawFoundation` mode

Drawing behavior (shared):
- Works like freeDraw: click to place points, line follows cursor
- Polyline is **not auto-closed** (open path, `closed: false`)
- Rendered with visible thickness on canvas (default 10cm = ~8px at default zoom)
- Each segment shows length label (same style as edge labels)
- Each corner shows angle label
- Shift for 45° snap (reuse existing)
- Snap to existing points/edges (reuse snap magnet system)
- Esc to finish drawing / cancel
- Double-click or click last point to finish

Shape created with:
```
elementType: 'fence' | 'wall' | 'kerb' | 'foundation'
closed: false
thickness: 0.10  (10cm default, editable in card)
layer: 2
```

#### F3. Linear Element Rendering
- Render as a thick polyline (not just a 1px line)
- Thickness = `shape.thickness * PIXELS_PER_METER * zoom` pixels
- Use a filled polygon: offset each segment by ±thickness/2 along the normal
- Different colors per element type:
  - Fence: warm brown / wood tone
  - Wall: gray / stone tone
  - Kerbs: darker gray
  - Foundation: concrete / beige
- Show total length label (sum of all segments)
- Show per-segment length labels
- Show corner angle labels
- When selected: show edit points (same as polygon points)
- Editing: drag points to reshape — lengths and angles update live
- Small icon/badge on the element showing its type (F/W/K/Fd)

#### F4. Object Card Modal System
Triggered by: **right-click on any Layer 2 shape → "Edit Object Card"** (context menu item)

**Modal layout:**
```
┌─────────────────────────────────────────────┐
│  Object Card — [Shape Label]            [X] │
├─────────────────────────────────────────────┤
│                                             │
│  Element Type: [dropdown / button group]    │
│  Sub-type:     [dropdown] (if applicable)   │
│                                             │
│  ─── Auto-filled from canvas ───            │
│  Area: 12.50 m²  (or Length: 8.200 m)       │
│  Perimeter: 15.300 m                        │
│  Segments: 3 (for linear)                   │
│  Corners: 2 (for linear)                    │
│                                             │
│  ─── Calculator ───                         │
│  [Embedded calculator component]            │
│  [with auto-filled inputs pre-populated]    │
│                                             │
│  ─── Results Preview ───                    │
│  Materials: [list]                          │
│  Tasks: [list]                              │
│  Total hours: X.XX                          │
│                                             │
├─────────────────────────────────────────────┤
│                    [Cancel]  [Save to Shape] │
└─────────────────────────────────────────────┘
```

**For area elements (polygons):**
- Type selector shows: Slabs, Paving, Artificial Grass, Deck, Steps (Standard/L/U), Turf

**For linear elements:**
- Type is pre-determined by `elementType`:
  - `fence` → shows only: Vertical, Horizontal, Venetian, Composite
  - `wall` → shows only: Brick, 4-inch Block, 7-inch Block, Sleeper
  - `kerb` → shows only: KL, Rumbled, Flat, Sets
  - `foundation` → single calculator, no sub-type choice

**Save behavior:**
- Saves `calculatorType`, `calculatorSubType`, `calculatorInputs`, `calculatorResults` into the Shape
- Persists until changed or removed
- Re-opening the card shows previously saved data

#### F5. Auto-fill from Canvas to Calculator

| Canvas data | How calculated | Target calculator inputs |
|---|---|---|
| Area (m²) | Shoelace formula (existing) | `area` for Slabs, Paving, Artificial Grass |
| Bounding box length | max X extent of shape | `totalLength` for Deck |
| Bounding box width | max Y extent of shape | `totalWidth` for Deck |
| Total linear length | sum of all segment lengths | `length` for Fence, Wall, Kerbs, Foundation |
| Segment count | `points.length - 1` (open) or `points.length` (closed) | corner/turn count |
| Individual edge lengths | distance between consecutive points | individual segment data |
| Perimeter | sum of all edge lengths | reference display |

**Auto-fill rules:**
- Auto-filled values are **pre-populated** when the calculator loads
- They update live if the user edits the shape on canvas (resize, move points)
- User can still override auto-filled values manually in the calculator
- Auto-filled fields are visually marked (e.g. subtle background or "from canvas" label)

#### F6. Calculator Embedding
- Reuse existing calculator components (SlabCalculator, FenceCalculator, etc.)
- Pass auto-filled values as props
- Pass `onResultsChange` callback to capture results
- Pass global equipment settings (excavator, carrier, transport)
- Each calculator already has `isInProjectCreating` prop — reuse this
- New prop: `autoFillData` with canvas-derived values

#### F7. Turf Type (Special Case)
- When user selects "Turf" as element type:
  - No calculator component shown
  - Just displays: Area = X.XX m²
  - Auto-generates minimal results:
    ```
    { name: 'Turf', amount: area, unit: 'square meters', hours_worked: 0, materials: [], taskBreakdown: [] }
    ```
  - Saved to shape like any other calculator result

#### F8. Visual Indicators on Canvas
- Shapes with assigned calculator: show a small **type badge** near the label
  - E.g. "Patio" + small icon "SL" (slabs) or "AG" (artificial grass)
- Shapes without calculator: show a subtle "?" or "No type assigned" indicator
- Color coding by element type:
  - Slabs/Paving: blue tones
  - Grass/Turf: green tones
  - Deck: brown tones
  - Steps: purple tones
  - Fence/Wall: gray/brown tones
  - Kerbs: dark gray tones
  - Foundation: beige/concrete tones
- Linear elements: rendered with thickness and type-specific color (see F3)

#### F9. Context Menu Updates
**Right-click on Layer 2 polygon:**
- Existing options (delete point, lock edge, etc.)
- **New: "Edit Object Card"** → opens Object Card modal
- **New: "Remove Calculator"** → clears calculator data from shape
- Shows current assigned type if any: "Type: Slabs (Porcelain)"

**Right-click on Layer 2 linear element:**
- Edit points, delete points (existing)
- **"Edit Object Card"** → opens Object Card modal (with pre-filtered calculator types)
- **"Remove Calculator"** → clears calculator data
- Shows current assigned type: "Type: Wall (Brick)"

#### F10. Global Equipment & Transport Settings
A **settings panel** (button in toolbar or a collapsible sidebar section):
- Select Excavator (from `setup_digging` where type = 'excavator')
- Select Carrier (from `setup_digging` where type = 'barrows_dumpers')
- Select Compactor
- Transport distance (meters)
- Calculate transport toggle

These settings are passed to ALL calculators as shared props.
Fetched from Supabase once when MasterProject loads.

#### F11. Project Summary Panel
A **collapsible panel** (bottom or side of canvas) showing:
- List of all Layer 2 elements with their types and status
- Per element: name, type, area/length, hours, material count
- **Totals row**: total hours, total materials (aggregated)
- Excavation total (aggregated from all calculators)
- Transport total (aggregated)
- Status indicators: ✓ (has calculator), ⚠ (no calculator assigned)
- Click on element → selects it on canvas + opens card

#### F12. "Create Project" Flow
**Button: "Create Project"** in toolbar or summary panel.

Pre-conditions check:
- Project title is set (prompt if not)
- At least one element has calculator results
- Warn about elements without calculators ("2 shapes have no calculator assigned — continue?")

**Submission process (mirrors ProjectCreating.tsx handleSubmit):**

1. Collect project settings (title, dates, status)
2. Create `events` record in Supabase
3. For each Layer 2 shape with `calculatorResults`:
   a. Create `task_folders` entry (folder per element, named by shape label)
   b. For each item in `taskBreakdown`:
      - Match to task template (`event_tasks_with_dynamic_estimates`)
      - Insert into `tasks_done`
   c. For each material:
      - Insert into `materials_delivered`
4. Aggregate excavation from all elements → create excavation tasks
5. Aggregate transport from all elements → create transport tasks
6. Create `invoices` record with full breakdown
7. Navigate to project view on success

#### F13. Project Info Input
Before or during canvas work, user needs to provide:
- Project title
- Description (optional)
- Start date, End date
- Status

This can be:
- A **header bar** above the canvas with inline inputs
- Or a **"Project Settings" modal** opened from toolbar

---

## Phase 2.1 — Slabs Visualization

> Visual rendering of slab patterns directly on shapes.

### Features

#### F2.1.1. Slab Pattern Rendering on Shape
- After assigning Slabs calculator to a shape, render the slab pattern ON the shape
- Slab size from calculator inputs (e.g. 90×60cm)
- Gap/grout width from calculator inputs
- Pattern types:
  - **Straight** (grid aligned)
  - **Brick** (offset every other row by 50%)
  - **Herringbone** (45° pattern) — stretch goal
- Direction of laying (0°, 90°, or custom angle)

#### F2.1.2. Cut Visualization
- Where slabs meet shape edges at non-right angles → show cut lines
- Color-code: full slabs (normal), cut slabs (highlighted/hatched)
- Calculate and display: X full slabs, Y cut slabs, Z% waste

#### F2.1.3. Starting Corner Selection
- User picks which corner to start laying from
- Pattern adjusts accordingly
- Affects cut placement and waste calculation

#### F2.1.4. Interactive Slab Editing
- Change slab size → pattern re-renders instantly
- Change pattern type → re-renders
- Change laying direction → re-renders
- Resize shape → pattern adapts, cuts recalculated

---

## Phase 2.2 — Artificial Grass Visualization

> Roll overlay system for artificial grass shapes.

### Features

#### F2.2.1. Roll Placement
- User defines available roll sizes (width × length, e.g. 4m × 15m)
- Rolls rendered as rectangles overlaid on the shape
- User can add multiple rolls

#### F2.2.2. Roll Manipulation
- Drag to position rolls
- Rotate rolls (0° or 90° typically)
- Snap rolls to shape edges

#### F2.2.3. Waste & Join Visualization
- Show overlap/join lines between rolls
- Show waste areas (roll extending beyond shape)
- Calculate: total roll area used, waste %, join length
- Color code: covered (green), uncovered (red warning), waste (gray)

#### F2.2.4. Coverage Validation
- Warning if shape is not fully covered
- Suggest roll arrangement for minimal waste

---

## Phase 2.3 — Decking Visualization

> Board rendering for deck shapes.

### Features

#### F2.3.1. Board Pattern Rendering
- Render individual deck boards on shape
- Board dimensions from calculator (length, width)
- Gap between boards from calculator
- Direction of laying (along length or width)

#### F2.3.2. Joist Visualization (Optional)
- Show joist lines perpendicular to boards
- Joist spacing from calculator
- Helps user verify structural layout

#### F2.3.3. Frame Option
- If frame is enabled in calculator, show frame border
- Frame board dimensions

#### F2.3.4. Board Count Display
- Full boards count
- Cut boards count  
- Total board length needed

---

## Phase 2.4 — Linear Calculator Integration

> Full integration of Fence, Wall, Kerbs, and Foundation calculators with linear elements.

### Features

#### F2.4.1. Fence Calculator Integration
- All 4 subtypes: Vertical, Horizontal, Venetian, Composite
- Auto-fill: total length, segment count, corner count
- Post positions calculated from line geometry
- Visualization on canvas: post markers along the line (stretch goal)

#### F2.4.2. Wall Calculator Integration
- All 4 subtypes: Brick, 4-inch Block, 7-inch Block, Sleeper
- Auto-fill: total length
- Height input (manual — not from canvas since 2D view)
- Foundation option: if enabled, auto-creates linked foundation element
- Height points from geodesy mode can inform slope calculations

#### F2.4.3. Kerbs & Edges Calculator Integration
- All 4 subtypes: KL, Rumbled, Flat, Sets
- Auto-fill: total length
- Hunch type, laying method inputs (manual)
- Visualization: dashed line style on canvas (stretch goal)

#### F2.4.4. Foundation Calculator Integration
- Single calculator
- Auto-fill: length (from linear element total length), width (from thickness or manual)
- Depth input (manual)
- Digging method, soil type (manual)

---

## Implementation Order (Suggested)

### Phase 2.0 — Core System (estimated: large)
```
Step 1:  F1  — Data model extension (Shape interface, types)
Step 2:  F2  — Linear drawing tools (new modes in toolbar)
Step 3:  F3  — Linear element rendering (thick polyline)
Step 4:  F4  — Object Card modal (UI shell, type selection)
Step 5:  F5  — Auto-fill system (canvas → calculator data mapping)
Step 6:  F6  — Calculator embedding in modal (reuse existing components)
Step 7:  F7  — Turf special case
Step 8:  F8  — Visual indicators on canvas (badges, colors)
Step 9:  F9  — Context menu updates
Step 10: F10 — Global equipment panel
Step 11: F11 — Project summary panel
Step 12: F12 — "Create Project" flow (Supabase integration)
Step 13: F13 — Project info input
```

### Phase 2.1 — Slabs Visualization
```
Step 1: F2.1.1 — Pattern rendering engine
Step 2: F2.1.2 — Cut calculation and visualization
Step 3: F2.1.3 — Starting corner selection
Step 4: F2.1.4 — Interactive editing / live updates
```

### Phase 2.2 — Artificial Grass
```
Step 1: F2.2.1 — Roll placement
Step 2: F2.2.2 — Roll manipulation (drag, rotate)
Step 3: F2.2.3 — Waste and join visualization
Step 4: F2.2.4 — Coverage validation
```

### Phase 2.3 — Decking
```
Step 1: F2.3.1 — Board pattern rendering
Step 2: F2.3.2 — Joist visualization
Step 3: F2.3.3 — Frame option
Step 4: F2.3.4 — Board count display
```

### Phase 2.4 — Linear Calculators
```
Step 1: F2.4.1 — Fence (all subtypes)
Step 2: F2.4.2 — Wall (all subtypes)
Step 3: F2.4.3 — Kerbs & Edges (all subtypes)
Step 4: F2.4.4 — Foundation
```

---

## Technical Notes

### File Structure (Proposed)
```
src/projectmanagement/canvacreator/
  MasterProject.tsx          — Main editor (extend with Phase 2 features)
  geometry.ts                — Types, math, shape factories (extend Shape interface)
  geodesy.ts                 — Slope calculations (no changes expected)
  objectCard/
    ObjectCardModal.tsx      — Object Card modal component
    CalculatorSelector.tsx   — Type/sub-type picker
    AutoFillProvider.tsx     — Canvas → calculator data mapping
    ProjectSummary.tsx       — Summary panel component
  linearElements/
    linearDrawing.ts         — Drawing logic for linear elements
    linearRendering.ts       — Rendering thick polylines
  visualization/             — Phase 2.1-2.3
    slabPattern.ts           — Slab pattern rendering
    grassRolls.ts            — Grass roll overlay
    deckBoards.ts            — Deck board rendering
```

### Key Principles
1. **Reuse existing calculators** — don't rewrite, embed them
2. **Auto-fill is a mapping layer** — canvas geometry → calculator props
3. **Results persist on Shape** — saved in `calculatorResults`, survives undo/redo
4. **Global equipment** — fetched once, shared via props/context
5. **Project creation mirrors ProjectCreating.tsx** — same Supabase tables, same data format
6. **Everything in English** — all UI labels, code, comments

### Calculator ↔ Element Type Mapping

| Element Type | Available Calculators | Auto-fill from canvas |
|---|---|---|
| Polygon → Slabs | SlabCalculator | area |
| Polygon → Paving | PavingCalculator | area |
| Polygon → Artificial Grass | ArtificialGrassCalculator | area, perimeter (join/trim length) |
| Polygon → Deck | DeckCalculator | bounding box length & width |
| Polygon → Steps Standard | StairCalculator | width |
| Polygon → Steps L-Shape | LShapeStairCalculator | arm lengths from edges |
| Polygon → Steps U-Shape | UShapeStairCalculator | arm lengths from edges |
| Polygon → Turf | (none — just area) | area |
| Linear → Fence * | FenceCalculator, VenetianFenceCalculator, CompositeFenceCalculator | total length, corners |
| Linear → Wall * | WallCalculator, SleeperWallCalculator | total length |
| Linear → Kerbs | KerbsEdgesAndSetsCalculator | total length |
| Linear → Foundation | FoundationCalculator | total length (as length), thickness (as width) |

\* Sub-types selected in the Object Card modal
