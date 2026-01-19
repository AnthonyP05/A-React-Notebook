import { Point, Bounds } from "../types/stroke";

export const boundsIntersect = (
    bounds: Bounds, 
    center: Point, 
    radiusPx: number,
    pageWidth: number,
    pageHeight: number
) => {
    const rX = radiusPx / pageWidth;
    const rY = radiusPx / pageHeight;
    return !(
        center.x + rX < bounds.minX ||
        center.x - rX > bounds.maxX ||
        center.y + rY < bounds.minY ||
        center.y - rY > bounds.maxY
    );
};

export const distancePointToSegment = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
) => {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = (apx * abx + apy * aby) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.hypot(px - cx, py - cy);
};
