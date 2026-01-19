import { Stroke, Point, Bounds } from "../types/stroke";
import { StrokeNormalizer } from "../utils/strokeNormalizer";
import { distancePointToSegment } from "../geometry/intersection";
import { toCanvasPoint } from "../geometry/coordinates";

export const generateStrokeId = () =>
    BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000));

// Check if a point is close to the eraser polyline
const isPointNearEraser = (
    point: Point,
    eraserPoints: Point[],
    radiusPx: number,
    pageWidth: number,
    pageHeight: number
) => {
    const px = point.x * pageWidth;
    const py = point.y * pageHeight;
    
    // Check against all eraser segments
    // Optimization: we could use a spatial index for the eraser path if it's very long,
    // but typically it's short enough for a simple O(M) loop
    for (let i = 0; i < eraserPoints.length - 1; i++) {
        const e1 = toCanvasPoint(eraserPoints[i], pageWidth, pageHeight);
        const e2 = toCanvasPoint(eraserPoints[i+1], pageWidth, pageHeight);
        
        const d = distancePointToSegment(px, py, e1.x, e1.y, e2.x, e2.y);
        if (d <= radiusPx) {
            return true;
        }
    }
    return false;
};

// Check if eraser bounds intersect stroke bounds
const eraserBoundsIntersect = (
    strokeBounds: Bounds,
    eraserBounds: Bounds,
    radiusPx: number,
    pageWidth: number,
    pageHeight: number
) => {
    // Expand eraser bounds by radius
    const rX = radiusPx / pageWidth;
    const rY = radiusPx / pageHeight;
    
    return !(
        eraserBounds.maxX + rX < strokeBounds.minX ||
        eraserBounds.minX - rX > strokeBounds.maxX ||
        eraserBounds.maxY + rY < strokeBounds.minY ||
        eraserBounds.minY - rY > strokeBounds.maxY
    );
};

export const eraseStrokes = (
    strokes: Stroke[],
    eraserStroke: Stroke,
    eraserMode: 'stroke' | 'partial',
    radiusPx: number,
    pageWidth: number,
    pageHeight: number
): { changed: boolean; nextStrokes: Stroke[] } => {
    if (eraserStroke.points.length < 2) {
        return { changed: false, nextStrokes: strokes };
    }

    const eraserBounds = eraserStroke.bounds;
    let changed = false;
    const nextStrokes: Stroke[] = [];

    for (const stroke of strokes) {
        // 1. Fast Bounds Check
        if (!eraserBoundsIntersect(stroke.bounds, eraserBounds, radiusPx, pageWidth, pageHeight)) {
            nextStrokes.push(stroke);
            continue;
        }

        // 2. Detailed Intersection
        if (eraserMode === 'stroke') {
            // If any point is hit, delete the whole stroke
            let hit = false;
            // Sampling optimization: check every Nth point to speed up? 
            // Better to check all for accuracy, or use segment intersection.
            for (const p of stroke.points) {
                 if (isPointNearEraser(p, eraserStroke.points, radiusPx, pageWidth, pageHeight)) {
                     hit = true;
                     break;
                 }
            }
            // Also need to check if eraser crosses a segment without hitting points?
            // "IsPointNearEraser" checks distance from point to eraser line.
            // Ideally we check intersection of two polylines.
            // But checking points is usually sufficient for "Stroke" eraser if stroke has high resolution.
            // To be safe, we should check if eraser points are near stroke segments too.
            // For now, let's assume high enough sampling rate.
            
            if (hit) {
                changed = true;
                continue; // Drop stroke
            } else {
                nextStrokes.push(stroke);
            }
        } else {
            // Partial Eraser
            const newSegments: Point[][] = [];
            let currentSegment: Point[] = [];
            let strokeModified = false;

            for (let i = 0; i < stroke.points.length; i++) {
                const p = stroke.points[i];
                const isHit = isPointNearEraser(p, eraserStroke.points, radiusPx, pageWidth, pageHeight);

                if (isHit) {
                    if (currentSegment.length > 0) {
                        newSegments.push(currentSegment);
                        currentSegment = [];
                    }
                    strokeModified = true;
                } else {
                    currentSegment.push(p);
                }
            }
            
            if (currentSegment.length > 0) {
                newSegments.push(currentSegment);
            }

            if (!strokeModified) {
                nextStrokes.push(stroke);
            } else {
                changed = true;
                // Create new strokes from segments
                for (const segment of newSegments) {
                    if (segment.length > 1) { // Filter single points
                        nextStrokes.push({
                            ...stroke,
                            strokeId: generateStrokeId(),
                            points: segment,
                            bounds: StrokeNormalizer.calculateBounds(segment)
                        });
                    }
                }
            }
        }
    }

    return { changed, nextStrokes };
};

