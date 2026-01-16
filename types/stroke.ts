// TypeScript types for Trilium Ink strokes

export interface Point {
  x: number;
  y: number;
  pressure: number;
  dt: number;          // time delta in ms from previous point
  tiltX?: number;      // pen tilt x
  tiltY?: number;      // pen tilt y
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stroke {
  strokeId: bigint;
  tool: ToolType;
  colorRGBA: number;
  baseWidth: number;
  bounds: Bounds;
  points: Point[];
}

export interface Layer {
  layerId: number;
  name: string;
  strokes: Stroke[];
  visible: boolean;
}

export interface Page {
  pageId: number;
  width: number;
  height: number;
  layers: Layer[];
  paperStyle?: PaperStyle;  // Optional for backwards compatibility
  createdTimestamp: bigint;
  modifiedTimestamp: bigint;
}

export enum ToolType {
  PEN = 0,
  HIGHLIGHTER = 1,
  ERASER = 2,
  MARKER = 3,
}

export type PaperStyle = 'blank' | 'lined' | 'grid' | 'dots';

export interface RawPointerEvent {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
  tiltX?: number;
  tiltY?: number;
}

export interface StrokeIndexEntry {
  strokeId: bigint;
  pageId: number;
  bounds: Bounds;
}

export interface PageIndexEntry {
  pageId: number;
  title: string;
  createdTimestamp: bigint;
  modifiedTimestamp: bigint;
}

export interface Manifest {
  version: number;
  createdBy: string;
  createdTimestamp: bigint;
  pageCount: number;
  totalStrokes: number;
}
