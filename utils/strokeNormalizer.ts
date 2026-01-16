import { Point, Bounds, Stroke, RawPointerEvent, ToolType } from '../types/stroke';

/**
 * Normalizes raw pointer events into a stroke with optimized point data
 */
export class StrokeNormalizer {
  private static nextStrokeId = 0n;

  /**
   * Normalize a sequence of raw pointer events into a Stroke
   * This performs:
   * - Time delta calculation
   * - Bounding box calculation
   * - Optional point simplification (Douglas-Peucker)
   */
  static normalizeStroke(
    rawEvents: RawPointerEvent[],
    tool: ToolType,
    colorRGBA: number,
    baseWidth: number,
    simplify: boolean = true,
    epsilon: number = 0.5
  ): Stroke {
    if (rawEvents.length === 0) {
      throw new Error('Cannot normalize empty stroke');
    }

    // Calculate time deltas
    const points: Point[] = rawEvents.map((event, index) => {
      const dt = index === 0 ? 0 : event.timestamp - rawEvents[index - 1].timestamp;
      return {
        x: event.x,
        y: event.y,
        pressure: event.pressure,
        dt,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
      };
    });

    // Optionally simplify points using Douglas-Peucker algorithm
    const finalPoints = simplify ? this.simplifyPoints(points, epsilon) : points;

    // Calculate bounds
    const bounds = this.calculateBounds(finalPoints);

    // Generate stroke ID
    const strokeId = BigInt(Date.now()) * 1000000n + this.nextStrokeId++;

    return {
      strokeId,
      tool,
      colorRGBA,
      baseWidth,
      bounds,
      points: finalPoints,
    };
  }

  /**
   * Calculate bounding box for a set of points
   */
  static calculateBounds(points: Point[]): Bounds {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Simplify stroke points using Douglas-Peucker algorithm
   * Reduces the number of points while maintaining shape
   */
  static simplifyPoints(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) {
      return points;
    }

    return this.douglasPeucker(points, epsilon);
  }

  private static douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) {
      return points;
    }

    // Find the point with maximum distance from line between first and last
    let maxDistance = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], start, end);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDistance > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIndex), epsilon);

      // Combine results, removing duplicate point at junction
      return [...left.slice(0, -1), ...right];
    } else {
      // Max distance is less than epsilon, discard intermediate points
      return [start, end];
    }
  }

  private static perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    // Handle degenerate case where line start equals line end
    if (dx === 0 && dy === 0) {
      return Math.sqrt(
        Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
      );
    }

    // Calculate perpendicular distance
    const numerator = Math.abs(
      dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
    );
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
  }

  /**
   * Convert RGB to RGBA uint32
   */
  static rgbToUint32(r: number, g: number, b: number, a: number = 255): number {
    return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff);
  }

  /**
   * Convert RGBA uint32 to RGB object
   */
  static uint32ToRGB(rgba: number): { r: number; g: number; b: number; a: number } {
    return {
      r: (rgba >>> 24) & 0xff,
      g: (rgba >>> 16) & 0xff,
      b: (rgba >>> 8) & 0xff,
      a: rgba & 0xff,
    };
  }

  /**
   * Convert RGBA uint32 to CSS color string
   */
  static uint32ToCSSColor(rgba: number): string {
    const { r, g, b, a } = this.uint32ToRGB(rgba);
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  }
}
