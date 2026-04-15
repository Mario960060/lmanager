// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/labelCollisionEngine.ts
// Generic label collision engine: zoom visibility, clustering,
// spatial-grid-accelerated force-directed displacement.
// ══════════════════════════════════════════════════════════════

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

// ── Types ─────────────────────────────────────────────────────

export interface LabelRect {
  id: string;
  anchorX: number;        // world coordinates (geodesy point position)
  anchorY: number;
  width: number;          // screen pixels (measured from ctx.measureText + padding)
  height: number;         // screen pixels
  text: string;
  priority: number;       // 1 = most important, higher = less important
  group: string;          // element name for grouping (e.g. "patio dol")
  screenX: number;        // screen position of card left edge (set by engine)
  screenY: number;        // screen position of card top edge (set by engine)
  visible: boolean;       // whether label is shown at current zoom
  collapsed: boolean;     // whether label is collapsed to a dot
  /** Opaque payload carried through the pipeline (e.g. geodesy card entries). */
  payload?: unknown;
}

export interface LabelCluster {
  labels: LabelRect[];
  centerX: number;        // average screen X of cluster members
  centerY: number;        // average screen Y of cluster members
  representative: LabelRect;
}

/** Immovable screen rects (e.g. compact height labels, other geodesy anchors). */
export type StaticObstacleRect = { left: number; top: number; right: number; bottom: number };

export interface LabelCollisionResolveOptions {
  /** Per-label obstacles; label is pushed away, obstacles never move. */
  getStaticObstaclesForLabel?: (label: LabelRect) => StaticObstacleRect[];
  /** Preferred separation axis (bisector) for a label — when provided, collision pushes follow this direction. */
  getSeparationAxisForLabel?: (label: LabelRect, worldToScreen: WorldToScreen) => { x: number; y: number } | null;
}

/** Optional tuning (e.g. geodesy PDF: mm-based margin and leader length). */
export interface LabelCollisionProcessOptions {
  /** Skip zoom-based collapse; every label stays visible. */
  forceAllVisible?: boolean;
  maxLeaderLengthPx?: number;
  collisionMarginPx?: number;
  /** Default 30. Use 0 for geodesy PDF so each label stays its own cluster. */
  clusterMinDistancePx?: number;
  /**
   * Zastępuje domyślny krok 1 (offset nad kotwicą). Geodezja: bisektrysa na zewnątrz.
   */
  getInitialLabelScreenPosition?: (
    label: LabelRect,
    worldToScreen: WorldToScreen,
    canvasW: number,
    canvasH: number,
  ) => void;
}

// ── Configurable zoom thresholds ──────────────────────────────

export const ZOOM_THRESHOLDS = {
  SHOW_ALL: 0.8,
  SHOW_PRIORITY_2: 0.4,
  SHOW_MINIMAL: 0.2,
  SHOW_NONE: 0.1,
} as const;

/** Domyślny max odległość środka etykiety od kotwicy (px CSS). Geodezja na kanwie nadpisuje (np. 70). */
export const DEFAULT_MAX_LEADER_LENGTH_PX = 72;
const MAX_LEADER_LENGTH_PX = DEFAULT_MAX_LEADER_LENGTH_PX;
/** Domyślny margines przy rozpychaniu nakładających się etykiet (px). */
export const DEFAULT_COLLISION_MARGIN_PX = 2;
const COLLISION_MARGIN_PX = DEFAULT_COLLISION_MARGIN_PX;
const MAX_ITERATIONS = 56;
/** Geodezja (bisektrysa): min. odległość środka etykiety od kotwicy wzdłuż osi (px). */
const GEODESY_MIN_ALONG_LEADER_PX = 1;

// ── Spatial hash grid ─────────────────────────────────────────

class SpatialGrid {
  private cellSize: number;
  private grid = new Map<string, LabelRect[]>();

  constructor(cellSize = 100) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.grid.clear();
  }

  insert(label: LabelRect): void {
    const x1 = Math.floor(label.screenX / this.cellSize);
    const x2 = Math.floor((label.screenX + label.width) / this.cellSize);
    const y1 = Math.floor(label.screenY / this.cellSize);
    const y2 = Math.floor((label.screenY + label.height) / this.cellSize);
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const k = `${x},${y}`;
        let bucket = this.grid.get(k);
        if (!bucket) { bucket = []; this.grid.set(k, bucket); }
        bucket.push(label);
      }
    }
  }

  getPotentialCollisions(label: LabelRect): LabelRect[] {
    const results = new Set<LabelRect>();
    const x1 = Math.floor(label.screenX / this.cellSize) - 1;
    const x2 = Math.floor((label.screenX + label.width) / this.cellSize) + 1;
    const y1 = Math.floor(label.screenY / this.cellSize) - 1;
    const y2 = Math.floor((label.screenY + label.height) / this.cellSize) + 1;
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const bucket = this.grid.get(`${x},${y}`);
        if (bucket) for (const other of bucket) {
          if (other !== label) results.add(other);
        }
      }
    }
    return Array.from(results);
  }
}

// ── Engine ────────────────────────────────────────────────────

export class LabelCollisionEngine {
  private spatialGrid = new SpatialGrid();
  private _clusters: LabelCluster[] = [];

  getClusters(): LabelCluster[] {
    return this._clusters;
  }

  /**
   * Full pipeline: world→screen, visibility, clustering, displacement.
   * @param labels       Array of label rects to position (mutated in-place).
   * @param worldToScreen Transform function.
   * @param zoom         Current zoom level.
   * @param canvasW      Canvas width in CSS pixels.
   * @param canvasH      Canvas height in CSS pixels.
   * @param forceVisibleIds  Labels to keep visible regardless of zoom (e.g. editing card).
   */
  process(
    labels: LabelRect[],
    worldToScreen: WorldToScreen,
    zoom: number,
    canvasW: number,
    canvasH: number,
    forceVisibleIds?: Set<string>,
    resolveOptions?: LabelCollisionResolveOptions,
    processOptions?: LabelCollisionProcessOptions,
  ): void {
    if (labels.length === 0) { this._clusters = []; return; }

    const marginPx = processOptions?.collisionMarginPx ?? COLLISION_MARGIN_PX;
    const maxLeaderPx = processOptions?.maxLeaderLengthPx ?? MAX_LEADER_LENGTH_PX;
    const minClusterDist = processOptions?.clusterMinDistancePx ?? 22;

    // STEP 1: world → screen (domyślnie nad-prawo od kotwicy; geodezja może nadpisać bisektrysą)
    const initFn = processOptions?.getInitialLabelScreenPosition;
    if (initFn) {
      for (const label of labels) {
        initFn(label, worldToScreen, canvasW, canvasH);
      }
    } else {
      for (const label of labels) {
        const sp = worldToScreen(label.anchorX, label.anchorY);
        label.screenX = sp.x + 8;
        label.screenY = sp.y - label.height - 16;
      }
    }

    // STEP 2: zoom-based visibility
    this.calculateVisibility(labels, zoom, forceVisibleIds, processOptions?.forceAllVisible);

    // Separate visible labels from collapsed-to-dot labels
    const visible = labels.filter(l => l.visible);
    const collapsedToDot = labels.filter(l => !l.visible && l.collapsed);

    // STEP 3: clustering (group spatially-close visible labels)
    this._clusters = this.clusterLabels(visible, minClusterDist).map(cl => {
      const nonCompact = cl.labels.find(l => !(l.payload as { compact?: boolean })?.compact);
      const representative = nonCompact ?? cl.labels[0];
      return { ...cl, representative };
    });

    // STEP 4: force-directed displacement on representatives only
    const toDisplace = this._clusters.map(c => c.representative);
    this.resolveCollisions(toDisplace, worldToScreen, canvasW, canvasH, forceVisibleIds, resolveOptions, marginPx, maxLeaderPx);

    // Update cluster center positions after displacement
    for (const cluster of this._clusters) {
      if (cluster.labels.length > 1) {
        const rep = cluster.representative;
        cluster.centerX = rep.screenX + rep.width / 2;
        cluster.centerY = rep.screenY + rep.height / 2;
      }
    }

    // Re-add collapsed-to-dot labels as single-element clusters (for dot rendering)
    for (const label of collapsedToDot) {
      this._clusters.push({
        labels: [label],
        centerX: label.screenX + label.width / 2,
        centerY: label.screenY + label.height / 2,
        representative: label,
      });
    }
  }

  // ── Step 2: Zoom visibility ──────────────────────────────────

  private calculateVisibility(
    labels: LabelRect[],
    zoom: number,
    forceVisibleIds?: Set<string>,
    _forceAllVisible?: boolean,
  ): void {
    for (const label of labels) {
      if (forceVisibleIds?.has(label.id)) {
        label.visible = true;
        label.collapsed = false;
        continue;
      }
      if (zoom >= ZOOM_THRESHOLDS.SHOW_ALL) {
        label.visible = true;
        label.collapsed = false;
      } else if (zoom >= ZOOM_THRESHOLDS.SHOW_PRIORITY_2) {
        label.visible = label.priority <= 2;
        label.collapsed = !label.visible;
      } else if (zoom >= ZOOM_THRESHOLDS.SHOW_MINIMAL) {
        label.visible = label.priority <= 1;
        label.collapsed = !label.visible;
      } else if (zoom >= ZOOM_THRESHOLDS.SHOW_NONE) {
        label.visible = false;
        label.collapsed = true;
      } else {
        label.visible = false;
        label.collapsed = false;
      }
    }
  }

  // ── Step 3: Clustering ───────────────────────────────────────

  private clusterLabels(visibleLabels: LabelRect[], minDistance: number): LabelCluster[] {
    const clusters: LabelCluster[] = [];
    const assigned = new Set<string>();
    const sorted = [...visibleLabels].sort((a, b) => a.priority - b.priority);

    for (const label of sorted) {
      if (assigned.has(label.id)) continue;

      const cluster: LabelRect[] = [label];
      assigned.add(label.id);

      for (const other of sorted) {
        if (assigned.has(other.id)) continue;
        const dx = (label.screenX + label.width / 2) - (other.screenX + other.width / 2);
        const dy = (label.screenY + label.height / 2) - (other.screenY + other.height / 2);
        if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      const cx = cluster.reduce((s, l) => s + l.screenX + l.width / 2, 0) / cluster.length;
      const cy = cluster.reduce((s, l) => s + l.screenY + l.height / 2, 0) / cluster.length;

      clusters.push({
        labels: cluster,
        centerX: cx,
        centerY: cy,
        representative: cluster[0],
      });
    }

    return clusters;
  }

  // ── Step 4: Force-directed displacement ──────────────────────

  /** Geodezja: środek etykiety na promieniu kotwica → bisektrysa; odległość wzdłuż osi w [min, max]. */
  private clampAlongSeparationAxis(
    label: LabelRect,
    worldToScreen: WorldToScreen,
    dir: { x: number; y: number },
    maxLeaderLengthPx: number,
  ): void {
    const anchor = worldToScreen(label.anchorX, label.anchorY);
    const len = Math.hypot(dir.x, dir.y);
    if (len < 1e-9) return;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const cx = label.screenX + label.width / 2;
    const cy = label.screenY + label.height / 2;
    let t = (cx - anchor.x) * ux + (cy - anchor.y) * uy;
    t = Math.max(GEODESY_MIN_ALONG_LEADER_PX, Math.min(maxLeaderLengthPx, t));
    label.screenX = anchor.x + t * ux - label.width / 2;
    label.screenY = anchor.y + t * uy - label.height / 2;
  }

  private resolveCollisions(
    labels: LabelRect[],
    worldToScreen: WorldToScreen,
    _canvasW: number,
    _canvasH: number,
    _forceVisibleIds?: Set<string>,
    resolveOptions?: LabelCollisionResolveOptions,
    collisionMarginPx: number = COLLISION_MARGIN_PX,
    maxLeaderLengthPx: number = MAX_LEADER_LENGTH_PX,
  ): void {
    const staticFn = resolveOptions?.getStaticObstaclesForLabel;
    const axisFn = resolveOptions?.getSeparationAxisForLabel;
    if (labels.length === 0) return;
    if (labels.length === 1 && !staticFn) return;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let anyOverlap = false;

      if (labels.length >= 2) {
        this.spatialGrid.clear();
        for (const label of labels) this.spatialGrid.insert(label);

        const processed = new Set<string>();

        for (const label of labels) {
          const potentials = this.spatialGrid.getPotentialCollisions(label);
          for (const other of potentials) {
            const pairKey = label.id < other.id ? `${label.id}|${other.id}` : `${other.id}|${label.id}`;
            if (processed.has(pairKey)) continue;
            processed.add(pairKey);

            const overlapX =
              Math.min(label.screenX + label.width + collisionMarginPx, other.screenX + other.width + collisionMarginPx) -
              Math.max(label.screenX - collisionMarginPx, other.screenX - collisionMarginPx);
            const overlapY =
              Math.min(label.screenY + label.height + collisionMarginPx, other.screenY + other.height + collisionMarginPx) -
              Math.max(label.screenY - collisionMarginPx, other.screenY - collisionMarginPx);

            if (overlapX > 0 && overlapY > 0) {
              anyOverlap = true;

              if (axisFn) {
                const worse = label.priority >= other.priority ? label : other;
                const dirW = axisFn(worse, worldToScreen);
                if (dirW) {
                  const push = Math.min(overlapX, overlapY) * 0.35 + 0.5;
                  worse.screenX += dirW.x * push;
                  worse.screenY += dirW.y * push;
                  this.clampAlongSeparationAxis(worse, worldToScreen, dirW, maxLeaderLengthPx);
                }
              } else {
                const totalPri = label.priority + other.priority;
                const ratioA = other.priority / totalPri;
                const ratioB = label.priority / totalPri;
                if (overlapX < overlapY) {
                  const dir = label.screenX <= other.screenX ? -1 : 1;
                  const push = overlapX / 2;
                  label.screenX += dir * push * ratioA;
                  other.screenX -= dir * push * ratioB;
                } else {
                  const dir = label.screenY <= other.screenY ? -1 : 1;
                  const push = overlapY / 2;
                  label.screenY += dir * push * ratioA;
                  other.screenY -= dir * push * ratioB;
                }
              }
            }
          }
        }
      }

      if (staticFn) {
        for (const label of labels) {
          const dir = axisFn?.(label, worldToScreen);
          for (const obs of staticFn(label)) {
            if (this.labelOverlapsStaticRectWithMargin(label, obs, collisionMarginPx)) {
              if (dir) {
                const olapX =
                  Math.min(label.screenX + label.width + collisionMarginPx, obs.right) -
                    Math.max(label.screenX - collisionMarginPx, obs.left);
                const olapY =
                  Math.min(label.screenY + label.height + collisionMarginPx, obs.bottom) -
                    Math.max(label.screenY - collisionMarginPx, obs.top);
                const push = Math.min(olapX, olapY) * 0.25 + 0.5;
                label.screenX += dir.x * push;
                label.screenY += dir.y * push;
                this.clampAlongSeparationAxis(label, worldToScreen, dir, maxLeaderLengthPx);
                anyOverlap = true;
                break;
              } else {
                this.pushLabelOutOfStaticRectWithMargin(label, obs, collisionMarginPx);
              }
              anyOverlap = true;
            }
          }
        }
      }

      if (!anyOverlap) break;
    }

    /** Geodezja: końcowy limit tylko wzdłuż bisektrysy. Inne etykiety: skala radialna od kotwicy. */
    for (const label of labels) {
      const anchor = worldToScreen(label.anchorX, label.anchorY);
      const cx = label.screenX + label.width / 2;
      const cy = label.screenY + label.height / 2;
      const dx = cx - anchor.x;
      const dy = cy - anchor.y;
      const dist = Math.hypot(dx, dy);

      if (axisFn) {
        const dir = axisFn(label, worldToScreen);
        if (dir) {
          this.clampAlongSeparationAxis(label, worldToScreen, dir, maxLeaderLengthPx);
          continue;
        }
      }

      if (dist > maxLeaderLengthPx && dist > 1e-6) {
        const scale = maxLeaderLengthPx / dist;
        label.screenX = anchor.x + dx * scale - label.width / 2;
        label.screenY = anchor.y + dy * scale - label.height / 2;
      }
    }
  }

  private labelOverlapsStaticRectWithMargin(label: LabelRect, obs: StaticObstacleRect, marginPx: number): boolean {
    const overlapX =
      Math.min(label.screenX + label.width + marginPx, obs.right) -
      Math.max(label.screenX - marginPx, obs.left);
    const overlapY =
      Math.min(label.screenY + label.height + marginPx, obs.bottom) -
      Math.max(label.screenY - marginPx, obs.top);
    return overlapX > 0 && overlapY > 0;
  }

  private pushLabelOutOfStaticRectWithMargin(label: LabelRect, obs: StaticObstacleRect, marginPx: number): void {
    const L = label.screenX - marginPx;
    const R = label.screenX + label.width + marginPx;
    const T = label.screenY - marginPx;
    const B = label.screenY + label.height + marginPx;
    const overlapX = Math.min(R, obs.right) - Math.max(L, obs.left);
    const overlapY = Math.min(B, obs.bottom) - Math.max(T, obs.top);
    if (overlapX <= 0 || overlapY <= 0) return;

    if (overlapX < overlapY) {
      const midObs = (obs.left + obs.right) / 2;
      const midLab = label.screenX + label.width / 2;
      label.screenX += midLab < midObs ? -overlapX : overlapX;
    } else {
      const midObs = (obs.top + obs.bottom) / 2;
      const midLab = label.screenY + label.height / 2;
      label.screenY += midLab < midObs ? -overlapY : overlapY;
    }
  }
}
