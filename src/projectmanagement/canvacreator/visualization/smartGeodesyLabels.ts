// ══════════════════════════════════════════════════════════════
// MASTER PROJECT — visualization/smartGeodesyLabels.ts
// Smart geodesy labels: zoom-aware visibility, clustering,
// collision avoidance via LabelCollisionEngine.
// Geodesy point labels on canvas (zoom-aware clustering, leaders); classic layout lives in geodesyLabels.ts for reuse (measurements, PDF helpers).
// ══════════════════════════════════════════════════════════════

import { Shape, Point, EDGE_LENGTH_LABEL_FONT, MM_PER_CSS_PX, roundHeightMToTenthCm } from "../geometry";
import {
  type GeodesyPoint,
  type GeodesyCardEntry,
  type GeodesyCardInfo,
  collectGeodesyPoints,
  filterGeodesyPointsByHidden,
  groupByPosition,
  buildEntriesWithPoints,
  isSamePoint,
  GEODESY_CARD_PAD,
  GEODESY_CARD_ROW_H,
  formatGeodesyHeightM,
  allSameHeightInGroup,
  geoEntryKey,
  measureCompactGeodesyHeightLabelRect,
  geodesyPointScreenObstacleRect,
} from "./geodesyLabels";
import {
  LabelCollisionEngine,
  type LabelRect,
  type LabelCluster,
  type StaticObstacleRect,
  type LabelCollisionProcessOptions,
} from "./labelCollisionEngine";
import { GEODESY_GROUP_PALETTE } from "./geodesyClusterColors";
import {
  applyGeodesyLabelBiasToCards,
  applyGeodesyLeaderLineVisibility,
  geodesyScreenOutwardDir,
  geodesyStretchOverlappingLabels,
  geodesyPushApartRemainingOverlaps,
  geodesySnapLabelsToOutwardHalfPlane,
  clampGeodesyLabelToLeaderAndCanvas,
  GEODESY_BISECTOR_BASE_OFFSET_PX,
  type GeodesyLabelBias,
} from "./geodesyLabelPlacement";
import { assignGeodesyOverlapColorIndices } from "./geodesyOverlapColors";

type WorldToScreen = (wx: number, wy: number) => { x: number; y: number };

const FONT_LABEL = EDGE_LENGTH_LABEL_FONT;

/**
 * Maks. długość linii odniesienia (px CSS) na kanwie — maleje przy oddaleniu (mały zoom),
 * żeby etykiety nie „pływały” po całym ekranie. Wcześniej stałe ~120 px było zbyt dużo.
 */
function geodesyCanvasMaxLeaderPx(zoom: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const raw = 14 + z * 14;
  return Math.max(18, Math.min(36, raw));
}

/**
 * Strony PDF 101/102 (geodezja): limity w mm na papierze — `mm` = mm/logiczny px z {@link computePdfImagePlacement}.
 * Wcześniej 15 mm / 2 mm było zbyt luźne względem ścisłej kanwy (~70 px, margines 2 px + clamp w silniku).
 */
const PDF_GEODESY_MAX_LEADER_MM = 10;
const PDF_GEODESY_COLLISION_MARGIN_MM = 1.5;

// ── Priority deduction ────────────────────────────────────────

function deducePriority(
  group: GeodesyPoint[],
  allShapes: Shape[],
  passesFilter: (s: Shape) => boolean,
): number {
  let bestPriority = 4;

  for (const p of group) {
    const shape = allShapes[p.shapeIdx];
    if (!shape) continue;

    // Layer 1 boundary corners → priority 1
    if (shape.layer === 1 && p.isVertex) {
      bestPriority = Math.min(bestPriority, 1);
      continue;
    }

    // Element corners (vertex points) → priority 2
    if (p.isVertex) {
      bestPriority = Math.min(bestPriority, 2);
      continue;
    }

    // Height points on edges → priority 3
    if (!p.isVertex && p.heightPointIdx != null) {
      bestPriority = Math.min(bestPriority, 3);
    }
  }

  return bestPriority;
}

// ── Card data (one per position-group) ────────────────────────

interface CardData {
  group: GeodesyPoint[];
  entries: GeodesyCardEntry[];
  rows: string[];
  cardW: number;
  cardH: number;
  worldX: number;
  worldY: number;
  priority: number;
  /** Same height at cluster — plain number only (no card), like excavation L4/L5 */
  compact?: boolean;
  /** Geodesy PDF 101/102: single-line label + straight leader, no “card” chrome */
  pdfPrint?: boolean;
  /** Ustawiane przez {@link applyGeodesyLabelBiasToCards} — kierunek bisektrysy w świecie. */
  geodesyLabelBias?: GeodesyLabelBias;
  /** Ustawiane po układzie: rysuj linię odniesienia tylko gdy etykieta odsunięta (kolizja / próg). */
  showGeodesyLeaderLine?: boolean;
}

/**
 * Kotwica etykiety / linii odniesienia — ten sam punkt co {@link applyGeodesyLabelBiasToCards}
 * (preferowany wierzchołek w grupie), NIE środek grupy pozycji ({@link CardData.worldX}/worldY).
 * Inaczej bisektrysa jest liczona od wierzchołka, a rysunek od centroidu → jeden kierunek „w dół” / zły leader.
 */
function geodesyAnchorWorldFromCard(card: CardData): { x: number; y: number } {
  const g = card.group;
  const p = g.find(pp => pp.isVertex) ?? g[0];
  if (!p) return { x: card.worldX, y: card.worldY };
  return { x: p.x, y: p.y };
}

/** Layer 2 polygon corners: always show full cards on L2 (with SL), regardless of zoom. */
function cardTouchesLayer2Vertex(shapes: Shape[], card: CardData): boolean {
  return card.group.some(p => {
    const sh = shapes[p.shapeIdx];
    return !!sh && sh.layer === 2 && p.isVertex;
  });
}

function buildCards(
  shapes: Shape[],
  passesFilter: (s: Shape) => boolean,
  ctx: CanvasRenderingContext2D,
  hiddenEntryKeys?: ReadonlySet<string> | null,
  pdfPrintMode?: boolean,
): CardData[] {
  const points = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);
  if (points.length === 0) return [];

  const groups = groupByPosition(points);
  ctx.font = FONT_LABEL;

  const cards: CardData[] = [];

  for (const group of groups) {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cy = group.reduce((s, p) => s + p.y, 0) / group.length;

    const priority = deducePriority(group, shapes, passesFilter);

    if (allSameHeightInGroup(group)) {
      const hAvg = group.reduce((s, p) => s + p.height, 0) / group.length;
      const h = roundHeightMToTenthCm(hAvg);
      const hStr = formatGeodesyHeightM(h);
      const m = ctx.measureText(hStr);
      const pad = pdfPrintMode ? GEODESY_CARD_PAD : 8;
      cards.push({
        group,
        entries: [{ label: "", height: h, points: [...group] }],
        rows: [hStr],
        cardW: m.width + pad * 2,
        cardH: pdfPrintMode ? GEODESY_CARD_ROW_H + pad * 2 : GEODESY_CARD_ROW_H,
        worldX: cx,
        worldY: cy,
        priority,
        compact: !pdfPrintMode,
        pdfPrint: !!pdfPrintMode,
      });
      continue;
    }

    const entries = buildEntriesWithPoints(group);
    if (pdfPrintMode) {
      const row = entries.map(e => formatGeodesyHeightM(e.height)).join(" · ");
      const m = ctx.measureText(row);
      const pad = GEODESY_CARD_PAD;
      cards.push({
        group,
        entries,
        rows: [row],
        cardW: m.width + pad * 2,
        cardH: GEODESY_CARD_ROW_H + pad * 2,
        worldX: cx,
        worldY: cy,
        priority,
        pdfPrint: true,
      });
      continue;
    }

    const rows = entries.map(e => formatGeodesyHeightM(e.height));
    const metrics = rows.map(r => ctx.measureText(r));
    const cardW = Math.max(...metrics.map(m => m.width)) + GEODESY_CARD_PAD * 2;
    const cardH = rows.length * GEODESY_CARD_ROW_H + GEODESY_CARD_PAD * 2;

    cards.push({ group, entries, rows, cardW, cardH, worldX: cx, worldY: cy, priority });
  }

  return cards;
}

// ── Rendering helpers ─────────────────────────────────────────

/** Koniec linii odniesienia: środek prostokąta etykiety (nie „najbliższy punkt brzegu” — ten dawał złudzenie zawsze pionu/poziomu). */
function geodesyLeaderEndOnLabelRect(left: number, top: number, w: number, h: number): { x: number; y: number } {
  return { x: left + w / 2, y: top + h / 2 };
}

function geoLabelIndexFromId(id: string): number {
  const m = /^geo_(\d+)$/.exec(id);
  return m ? parseInt(m[1]!, 10) : 0;
}

function colorIdxForGeoLabel(label: LabelRect, anchorColorIndices: number[]): number {
  const i = geoLabelIndexFromId(label.id);
  return anchorColorIndices[i] ?? 0;
}

/** PDF 101/102: leader w kolorze grupy, tekst bez karty. */
function renderGeodesyPdfPrintLine(
  ctx: CanvasRenderingContext2D,
  label: LabelRect,
  worldToScreen: WorldToScreen,
  mmPerLogicalPx: number,
  colorIdx: number,
  canvasIsLight: boolean,
): void {
  const groupHex = GEODESY_GROUP_PALETTE[Math.min(Math.max(0, colorIdx), GEODESY_GROUP_PALETTE.length - 1)]!;
  const anchor = worldToScreen(label.anchorX, label.anchorY);
  const card = label.payload as CardData;
  if (!card?.rows.length) return;
  const left = label.screenX;
  const top = label.screenY;
  const w = label.width;
  const h = label.height;
  const end = geodesyLeaderEndOnLabelRect(left, top, w, h);
  if (card.showGeodesyLeaderLine) {
    ctx.save();
    ctx.strokeStyle = groupHex;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = Math.max(0.35, 0.4 * mmPerLogicalPx);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = FONT_LABEL;
  ctx.fillStyle = geodesyGroupTextFill(groupHex, canvasIsLight);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = left + GEODESY_CARD_PAD;
  const rowH = GEODESY_CARD_ROW_H;
  card.rows.forEach((row, i) => {
    ctx.fillText(row, textX, top + GEODESY_CARD_PAD + rowH / 2 + i * rowH);
  });
}

function renderSmartClusterBadge(
  ctx: CanvasRenderingContext2D,
  cluster: LabelCluster,
  worldToScreen: WorldToScreen,
  anchorColorIndices: number[],
): void {
  const x = cluster.centerX;
  const y = cluster.centerY;
  const count = cluster.labels.length;
  const radius = 14;

  for (const label of cluster.labels) {
    const anchor = worldToScreen(label.anchorX, label.anchorY);
    const ci = colorIdxForGeoLabel(label, anchorColorIndices);
    const hex = GEODESY_GROUP_PALETTE[Math.min(Math.max(0, ci), GEODESY_GROUP_PALETTE.length - 1)]!;
    ctx.save();
    ctx.strokeStyle = hex;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 1.85;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(74,158,255,0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(26,26,46,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px 'JetBrains Mono',monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), x, y);
}

// ── Main class ────────────────────────────────────────────────

/** Tekst wysokości — w kolorze grupy; na jasnym canvasie biała grupa → ciemny tekst (kontrast). */
function geodesyGroupTextFill(groupHex: string, canvasIsLight: boolean): string {
  const u = groupHex.trim().toUpperCase();
  if (canvasIsLight && (u === "#FFFFFF" || u === "#FFF")) {
    return "#0f172a";
  }
  return groupHex;
}

/** Wartość wysokości + leader (bez karty); linia w kolorze grupy @ 50%. */
function renderGeodesyFlatValueLabel(
  ctx: CanvasRenderingContext2D,
  label: LabelRect,
  worldToScreen: WorldToScreen,
  groupColorHex: string,
  canvasIsLight: boolean,
): void {
  const anchor = worldToScreen(label.anchorX, label.anchorY);
  const card = label.payload as CardData;
  if (!card?.rows.length) return;
  const left = label.screenX;
  const top = label.screenY;
  const w = label.width;
  const h = label.height;
  const end = geodesyLeaderEndOnLabelRect(left, top, w, h);
  if (card.showGeodesyLeaderLine) {
    ctx.save();
    ctx.strokeStyle = groupColorHex;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 1.85;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.font = FONT_LABEL;
  ctx.fillStyle = geodesyGroupTextFill(groupColorHex, canvasIsLight);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = left + GEODESY_CARD_PAD;
  const rowH = GEODESY_CARD_ROW_H;
  card.rows.forEach((row, i) => {
    ctx.fillText(row, textX, top + GEODESY_CARD_PAD + rowH / 2 + i * rowH);
  });
}

export class SmartGeodesyLabels {
  private engine = new LabelCollisionEngine();
  private labels: LabelRect[] = [];
  private cardDataMap = new Map<string, CardData>();
  private _clusters: LabelCluster[] = [];
  private _cardsInfo: GeodesyCardInfo[] = [];
  /** Indeks palety 0.. — biały gdy brak nakładania etykiet; inaczej rozróżnienie sąsiadów w grafie nakładania prostokątów tekstu. */
  private _anchorColorIndices: number[] = [];
  /** Kolor wypełnienia kropek na planie — ten sam co {@link geodesyGroupTextFill} dla etykiety karty (klucz {@link geoEntryKey}). */
  private _geodesyPointCanvasFillByKey = new Map<string, string>();
  /** Jasny, czysty — biały canvas; etykiety geodezyjne muszą być ciemne */
  private canvasIsLight = false;
  /** PDF strony 101/102 — kompaktowe etykiety + proste linie odniesienia */
  private geodesyPdfPrint = false;
  private mmPerLogicalPxPdf = MM_PER_CSS_PX;

  // Dirty tracking
  private lastPanX = NaN;
  private lastPanY = NaN;
  private lastZoom = NaN;
  private lastShapeCount = -1;
  private dirty = true;

  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Recompute layout if pan/zoom/shapes changed.
   * Call once per draw frame, before render().
   */
  update(
    shapes: Shape[],
    worldToScreen: WorldToScreen,
    pan: Point,
    zoom: number,
    canvasW: number,
    canvasH: number,
    passesFilter: (s: Shape) => boolean,
    ctx: CanvasRenderingContext2D,
    editingGroup: GeodesyPoint[] | null,
    hiddenEntryKeys?: ReadonlySet<string> | null,
    /** When 2, geodesy cards tied to layer-2 vertices stay full at any zoom (SL); other labels keep zoom behavior. */
    activeLayer?: number,
    /** Motyw Jasny, czysty — ciemne etykiety na jasnym canvasie */
    canvasIsLight?: boolean,
    /** Eksport PDF geodezji — jedna linia tekstu + leader, marginesy w mm */
    geodesyPdfPrint?: boolean,
    /** mm na logiczny px (z {@link computePdfImagePlacement}) — wymagane przy geodesyPdfPrint */
    mmPerLogicalPx?: number,
  ): void {
    this.canvasIsLight = canvasIsLight ?? false;
    this.geodesyPdfPrint = !!geodesyPdfPrint;
    this.mmPerLogicalPxPdf =
      mmPerLogicalPx && mmPerLogicalPx > 0 ? mmPerLogicalPx : MM_PER_CSS_PX;

    // Bez early-return: geometria może się zmienić bez zmiany liczby kształtów; HMR też nie wywoła pan/zoom.
    this.lastPanX = pan.x;
    this.lastPanY = pan.y;
    this.lastZoom = zoom;
    this.lastShapeCount = shapes.length;
    this.dirty = false;

    // Build card data (one per position-group)
    const cards = buildCards(shapes, passesFilter, ctx, hiddenEntryKeys, this.geodesyPdfPrint);
    applyGeodesyLabelBiasToCards(cards, shapes);
    const allPoints = filterGeodesyPointsByHidden(collectGeodesyPoints(shapes, passesFilter), hiddenEntryKeys);

    const compactHeightObstacles: StaticObstacleRect[] = [];
    for (const card of cards) {
      if (!card.compact) continue;
      const a = worldToScreen(card.worldX, card.worldY);
      compactHeightObstacles.push(
        measureCompactGeodesyHeightLabelRect(ctx, a, card.entries[0]?.height ?? card.group[0].height),
      );
    }

    this.cardDataMap.clear();

    // Build LabelRects from cards
    const forceVisibleIds = new Set<string>();

    this.labels = cards.map((card, i) => {
      const id = `geo_${i}`;
      this.cardDataMap.set(id, card);

      // If any point in this group is being edited, force visible
      if (editingGroup) {
        for (const gp of card.group) {
          if (editingGroup.some(eg => isSamePoint(gp, eg))) {
            forceVisibleIds.add(id);
            break;
          }
        }
      }

      if (activeLayer === 2 && cardTouchesLayer2Vertex(shapes, card)) {
        forceVisibleIds.add(id);
      }

      const aw = geodesyAnchorWorldFromCard(card);
      return {
        id,
        anchorX: aw.x,
        anchorY: aw.y,
        width: card.cardW,
        height: card.cardH,
        text: card.rows.join(" | "),
        priority: card.priority,
        group: card.group[0]?.label ?? "",
        screenX: 0,
        screenY: 0,
        visible: true,
        collapsed: false,
        payload: card,
      } satisfies LabelRect;
    });

    if (this.geodesyPdfPrint) {
      for (let i = 0; i < this.labels.length; i++) {
        forceVisibleIds.add(`geo_${i}`);
      }
    }

    const mm = this.mmPerLogicalPxPdf;
    const pdfProcessOpts: LabelCollisionProcessOptions = {
      forceAllVisible: true,
      collisionMarginPx: PDF_GEODESY_COLLISION_MARGIN_MM / mm,
      maxLeaderLengthPx: PDF_GEODESY_MAX_LEADER_MM / mm,
      clusterMinDistancePx: 0,
    };
    /**
     * Kanwa: `clusterMinDistancePx: 0` — każda etykieta jest osobnym „klastrem”.
     * {@link geodesyCanvasMaxLeaderPx} — limit odniesienia skalowany zoomem (krócej przy oddaleniu).
     */
    const canvasProcessOpts: LabelCollisionProcessOptions = {
      maxLeaderLengthPx: geodesyCanvasMaxLeaderPx(zoom),
      collisionMarginPx: 2,
      clusterMinDistancePx: 0,
    };
    const baseProcessOpts = this.geodesyPdfPrint ? pdfProcessOpts : canvasProcessOpts;
    const processOpts: LabelCollisionProcessOptions = {
      ...baseProcessOpts,
      getInitialLabelScreenPosition: (label, wts, _cw, _ch) => {
        const card = label.payload as CardData;
        const bias = card.geodesyLabelBias;
        if (!bias?.outwardWorld) {
          const sp = wts(label.anchorX, label.anchorY);
          label.screenX = sp.x + 8;
          label.screenY = sp.y - label.height - 16;
          return;
        }
        const dir = geodesyScreenOutwardDir(label.anchorX, label.anchorY, bias.outwardWorld, wts);
        const sp = wts(label.anchorX, label.anchorY);
        label.screenX = sp.x + dir.x * GEODESY_BISECTOR_BASE_OFFSET_PX - label.width / 2;
        label.screenY = sp.y + dir.y * GEODESY_BISECTOR_BASE_OFFSET_PX - label.height / 2;
      },
    };

    // Run collision engine (full cards avoid compact height text + other geodesy anchors)
    this.engine.process(
      this.labels,
      worldToScreen,
      zoom,
      canvasW,
      canvasH,
      forceVisibleIds,
      {
        getStaticObstaclesForLabel: label => {
          const card = label.payload as CardData;
          if (!card || card.compact) return [];
          const own = new Set(card.group.map(p => geoEntryKey(p)));
          const out: StaticObstacleRect[] = [...compactHeightObstacles];
          for (const p of allPoints) {
            if (own.has(geoEntryKey(p))) continue;
            out.push(geodesyPointScreenObstacleRect(worldToScreen(p.x, p.y)));
          }
          return out;
        },
        getSeparationAxisForLabel: (label, wts) => {
          const card = label.payload as CardData;
          const bias = card?.geodesyLabelBias;
          if (!bias?.outwardWorld) return null;
          return geodesyScreenOutwardDir(label.anchorX, label.anchorY, bias.outwardWorld, wts);
        },
      },
      processOpts,
    );
    this._clusters = this.engine.getClusters();

    if (!this.geodesyPdfPrint) {
      // Kanwa: ukryj etykiety, których punkt kotwicy jest poza widocznym ekranem.
      const OFF_MARGIN = 30;
      for (const label of this.labels) {
        if (!label.visible) continue;
        const sp = worldToScreen(label.anchorX, label.anchorY);
        if (
          sp.x < -OFF_MARGIN || sp.x > canvasW + OFF_MARGIN ||
          sp.y < -OFF_MARGIN || sp.y > canvasH + OFF_MARGIN
        ) {
          label.visible = false;
        }
      }
    } else {
      // PDF: lekkie rozsunięcie po bisektrysie + clamp w granicach leadera.
      const marginStretch = processOpts.collisionMarginPx ?? 2;
      const maxLeaderPdf = processOpts.maxLeaderLengthPx ?? 60;
      geodesyStretchOverlappingLabels(this.labels, worldToScreen, marginStretch);
      geodesyPushApartRemainingOverlaps(
        this.labels, worldToScreen, marginStretch, maxLeaderPdf, canvasW, canvasH,
      );
      geodesySnapLabelsToOutwardHalfPlane(this.labels, worldToScreen);
      for (const label of this.labels) {
        if (label.visible && !label.collapsed) {
          clampGeodesyLabelToLeaderAndCanvas(label, worldToScreen, maxLeaderPdf, canvasW, canvasH);
        }
      }
    }

    applyGeodesyLeaderLineVisibility(this.labels, worldToScreen);

    for (const cluster of this._clusters) {
      if (cluster.labels.length >= 2) {
        const rep = cluster.representative;
        cluster.centerX = rep.screenX + rep.width / 2;
        cluster.centerY = rep.screenY + rep.height / 2;
      }
    }

    this._anchorColorIndices = assignGeodesyOverlapColorIndices(this.labels);

    this._geodesyPointCanvasFillByKey.clear();
    const colorIdx = this._anchorColorIndices;
    const palMax = GEODESY_GROUP_PALETTE.length - 1;
    for (const label of this.labels) {
      const card = label.payload as CardData;
      if (!card?.group?.length) continue;
      const ci = colorIdxForGeoLabel(label, colorIdx);
      const hex = GEODESY_GROUP_PALETTE[Math.min(Math.max(0, ci), palMax)]!;
      const fill = geodesyGroupTextFill(hex, this.canvasIsLight);
      for (const p of card.group) {
        this._geodesyPointCanvasFillByKey.set(geoEntryKey(p), fill);
      }
    }

    // Build GeodesyCardInfo for hit testing compatibility
    this._cardsInfo = [];
    for (const cluster of this._clusters) {
      for (const label of cluster.labels) {
        if (label.collapsed || !label.visible) continue;
        if (cluster.labels.length > 5 && label !== cluster.representative) continue;

        const card = label.payload as CardData;
        if (!card) continue;

        const anchor = worldToScreen(label.anchorX, label.anchorY);
        this._cardsInfo.push({
          group: card.group,
          entries: card.entries,
          cardBounds: {
            left: label.screenX,
            top: label.screenY,
            right: label.screenX + label.width,
            bottom: label.screenY + label.height,
          },
          sp: anchor,
          leaderLen: 0,
        });
      }
    }
  }

  /**
   * Render all labels, clusters, badges (bez numerów punktów — tylko wartości wysokości).
   */
  render(
    ctx: CanvasRenderingContext2D,
    worldToScreen: WorldToScreen,
    _hoveredPoint: { shapeIdx: number; pointIdx: number } | null,
    _hoveredHeightPoint: { shapeIdx: number; heightPointIdx: number } | null,
    _editingGroup: GeodesyPoint[] | null,
  ): void {
    const idx = this._anchorColorIndices;

    if (this.geodesyPdfPrint) {
      const mm = this.mmPerLogicalPxPdf;
      for (const cluster of this._clusters) {
        if (cluster.labels.length >= 5) {
          renderSmartClusterBadge(ctx, cluster, worldToScreen, idx);
          continue;
        }
        for (const label of cluster.labels) {
          if (label.collapsed || !label.visible) continue;
          renderGeodesyPdfPrintLine(
            ctx,
            label,
            worldToScreen,
            mm,
            colorIdxForGeoLabel(label, idx),
            this.canvasIsLight,
          );
        }
      }
      return;
    }

    // Tekst wysokości + linie odniesienia
    for (const cluster of this._clusters) {
      if (cluster.labels.length >= 5) {
        continue;
      }
      for (const label of cluster.labels) {
        if (label.collapsed || !label.visible) continue;
        const ci = colorIdxForGeoLabel(label, idx);
        const hex = GEODESY_GROUP_PALETTE[Math.min(Math.max(0, ci), GEODESY_GROUP_PALETTE.length - 1)]!;
        renderGeodesyFlatValueLabel(ctx, label, worldToScreen, hex, this.canvasIsLight);
      }
    }

    for (const cluster of this._clusters) {
      if (cluster.labels.length >= 5) {
        renderSmartClusterBadge(ctx, cluster, worldToScreen, idx);
      }
    }
  }

  /**
   * Returns GeodesyCardInfo[] for hit testing compatibility with existing flow.
   */
  getCardsInfo(): GeodesyCardInfo[] {
    return this._cardsInfo;
  }

  /** Kolor kropki węzła / punktu wysokościowego — jak tekst etykiety (jasny motyw: biała grupa → ciemny). */
  getGeodesyPointCanvasFill(entryKey: string): string | undefined {
    return this._geodesyPointCanvasFillByKey.get(entryKey);
  }

  /**
   * Hit test for cluster badges and collapsed dots.
   * Returns the cluster if a badge is hit, or the label if a dot is hit.
   */
  hitTestBadgeOrDot(
    canvasX: number,
    canvasY: number,
    worldToScreen: WorldToScreen,
  ): { type: "badge"; cluster: LabelCluster } | { type: "dot"; label: LabelRect } | null {
    for (const cluster of this._clusters) {
      if (cluster.labels.length >= 5) {
        const dx = canvasX - cluster.centerX;
        const dy = canvasY - cluster.centerY;
        if (Math.sqrt(dx * dx + dy * dy) < 16) {
          return { type: "badge", cluster };
        }
      }
      for (const label of cluster.labels) {
        if (!label.collapsed && !label.visible) continue;
        const anchor = worldToScreen(label.anchorX, label.anchorY);
        const dx = canvasX - anchor.x;
        const dy = canvasY - anchor.y;
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          return { type: "dot", label };
        }
      }
    }
    return null;
  }

  /**
   * Get all cluster data (for tooltip rendering).
   */
  getClusters(): LabelCluster[] {
    return this._clusters;
  }
}
