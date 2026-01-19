import { Point } from "../types/stroke";
import { toCanvasPoint } from "../geometry/coordinates";

export const getVelocity = (prev: Point, curr: Point, pageWidth: number, pageHeight: number) => {
    const a = toCanvasPoint(prev, pageWidth, pageHeight);
    const b = toCanvasPoint(curr, pageWidth, pageHeight);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const dt = curr.dt > 0 ? curr.dt : 1;
    return dist / dt;
};
