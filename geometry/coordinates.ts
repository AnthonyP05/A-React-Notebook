import { Point, Bounds } from "../types/stroke";

export const toNormalizedPoint = (x: number, y: number, pageWidth: number, pageHeight: number) => ({
    x: x / pageWidth,
    y: y / pageHeight
});

export const toCanvasPoint = (p: Point, pageWidth: number, pageHeight: number) => ({
    x: p.x * pageWidth,
    y: p.y * pageHeight
});

export const strokeBoundsPx = (bounds: Bounds, pageWidth: number, pageHeight: number) => ({
    minX: bounds.minX * pageWidth,
    minY: bounds.minY * pageHeight,
    maxX: bounds.maxX * pageWidth,
    maxY: bounds.maxY * pageHeight
});

export const midpointCanvas = (a: Point, b: Point, pageWidth: number, pageHeight: number) => ({
    x: ((a.x + b.x) / 2) * pageWidth,
    y: ((a.y + b.y) / 2) * pageHeight
});

export const createBoundsFromPoint = (p: Point): Bounds => ({
    minX: p.x,
    minY: p.y,
    maxX: p.x,
    maxY: p.y
});

export const expandBounds = (bounds: Bounds, p: Point) => {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
};
