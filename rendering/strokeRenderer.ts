import { Stroke, Point, ToolType } from "../types/stroke";
import { StrokeNormalizer } from "../utils/strokeNormalizer";
import { toCanvasPoint, midpointCanvas } from "../geometry/coordinates";
import { getToolSettings } from "../tools/toolSettings";
import { getVelocity } from "../tools/velocity";
import { smoothPressure, pressureCurve } from "../tools/pressure";

export const getRenderWidth = (
    stroke: Stroke, 
    prev: Point, 
    curr: Point,
    pageWidth: number,
    pageHeight: number
) => {
    const { toolFactor, pressureGamma, velocityK, usePressureForWidth, useVelocity } = getToolSettings(stroke.tool);
    const p = smoothPressure(prev.pressure, curr.pressure);
    const velocity = useVelocity ? getVelocity(prev, curr, pageWidth, pageHeight) : 0;
    const velocityFactor = useVelocity ? (1 / (1 + velocity * velocityK)) : 1;
    const pressureFactor = usePressureForWidth ? pressureCurve(p, pressureGamma) : 1;
    return stroke.baseWidth * toolFactor * pressureFactor * velocityFactor;
};

export const getRenderAlpha = (stroke: Stroke, prev: Point, curr: Point) => {
    if (stroke.tool !== ToolType.HIGHLIGHTER) return 1;
    const p = smoothPressure(prev.pressure, curr.pressure);
    return Math.min(1, Math.max(0.3, 0.3 + p * 0.4));
};

export const drawStroke = (
    ctx: CanvasRenderingContext2D, 
    stroke: Stroke,
    pageWidth: number,
    pageHeight: number
) => {
    if (stroke.tool === ToolType.ERASER) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = StrokeNormalizer.uint32ToCSSColor(stroke.colorRGBA);
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.points.length < 2) return;
    if (stroke.points.length === 2) {
        const p0 = stroke.points[0];
        const p1 = stroke.points[1];
        const a = toCanvasPoint(p0, pageWidth, pageHeight);
        const b = toCanvasPoint(p1, pageWidth, pageHeight);
        ctx.beginPath();
        ctx.lineWidth = getRenderWidth(stroke, p0, p1, pageWidth, pageHeight);
        ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
    }

    for (let i = 2; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 2];
        const p1 = stroke.points[i - 1];
        const p2 = stroke.points[i];
        const start = midpointCanvas(p0, p1, pageWidth, pageHeight);
        const end = midpointCanvas(p1, p2, pageWidth, pageHeight);
        const control = toCanvasPoint(p1, pageWidth, pageHeight);

        ctx.beginPath();
        ctx.lineWidth = getRenderWidth(stroke, p0, p1, pageWidth, pageHeight);
        ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
};

export const drawLiveSegment = (
    ctx: CanvasRenderingContext2D, 
    stroke: Stroke,
    pageWidth: number,
    pageHeight: number
) => {
    const points = stroke.points;
    const len = points.length;
    if (len < 2) return;

    if (stroke.tool === ToolType.ERASER) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)'; // Color doesn't matter for destination-out, opacity does
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = StrokeNormalizer.uint32ToCSSColor(stroke.colorRGBA);
    }
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (len === 2) {
        const p0 = points[0];
        const p1 = points[1];
        const a = toCanvasPoint(p0, pageWidth, pageHeight);
        const b = toCanvasPoint(p1, pageWidth, pageHeight);
        ctx.beginPath();
        ctx.lineWidth = getRenderWidth(stroke, p0, p1, pageWidth, pageHeight);
        ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
    }

    const p0 = points[len - 3];
    const p1 = points[len - 2];
    const p2 = points[len - 1];

    const start = midpointCanvas(p0, p1, pageWidth, pageHeight);
    const end = midpointCanvas(p1, p2, pageWidth, pageHeight);
    const control = toCanvasPoint(p1, pageWidth, pageHeight);

    ctx.beginPath();
    ctx.lineWidth = getRenderWidth(stroke, p0, p1, pageWidth, pageHeight);
    ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
};
