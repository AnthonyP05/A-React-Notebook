import { useRef, useState, useEffect } from "react";
import { TypeWidgetProps } from "./mocks/type_widget";
import "./Notebook.css";
import "./Paper.css";
import { useNoteLabelBoolean } from "./mocks/react_hooks";
import { StrokeNormalizer } from "./utils/strokeNormalizer";
import { TriliumInkSerializer } from "./utils/serializer";
import { 
    Stroke, 
    Page, 
    ToolType,
    PaperStyle,
    Point,
    Bounds
} from "./types/stroke";

export default function Notebook({ note }: TypeWidgetProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeStrokeRef = useRef<Stroke | null>(null);
    const lastPointerTimeRef = useRef<number | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const undoStackRef = useRef<Array<{ before: Stroke[]; after: Stroke[] }>>([]);
    const redoStackRef = useRef<Array<{ before: Stroke[]; after: Stroke[] }>>([]);
    const eraserBeforeRef = useRef<Stroke[] | null>(null);
    const eraserDidChangeRef = useRef(false);
    const [isReadOnly] = useNoteLabelBoolean(note, "readOnly");
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentTool, setCurrentTool] = useState<ToolType>(ToolType.PEN);
    const [eraserMode, setEraserMode] = useState<'stroke' | 'partial'>('partial');
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);
    const [currentColor, setCurrentColor] = useState(
        StrokeNormalizer.rgbToUint32(0, 0, 0, 255)
    );
    const [currentWidth, setCurrentWidth] = useState(2);
    const [paperStyle, setPaperStyle] = useState<'blank' | 'lined' | 'grid' | 'dots'>('lined');
    
    // Completed strokes for current page
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    
    // Page data
    const [currentPage, setCurrentPage] = useState<Page>({
        pageId: 1,
        width: 800,
        height: 1000,
        paperStyle: 'lined',
        layers: [{
            layerId: 1,
            name: "Layer 1",
            strokes: [],
            visible: true
        }],
        createdTimestamp: BigInt(Date.now()),
        modifiedTimestamp: BigInt(Date.now())
    });

    // Redraw canvas when strokes change
    useEffect(() => {
        strokesRef.current = strokes;
        rebuildCacheFromStrokes();
        drawCacheToMain();
    }, [strokes]);

    // Sync paper style with current page
    useEffect(() => {
        if (currentPage.paperStyle && currentPage.paperStyle !== paperStyle) {
            setPaperStyle(currentPage.paperStyle);
        }
    }, [currentPage]);

    const normalizePressure = (p: number) => {
        if (p === 0) return 1.0; // mouse fallback
        return Math.min(Math.max(p, 0.1), 1.0);
    };

    const pressureCurve = (p: number, gamma: number) => Math.pow(p, gamma);

    const smoothPressure = (prev: number, curr: number) => prev * 0.7 + curr * 0.3;

    const midpointCanvas = (a: Point, b: Point) => ({
        x: ((a.x + b.x) / 2) * currentPage.width,
        y: ((a.y + b.y) / 2) * currentPage.height
    });

    const getVelocity = (prev: Point, curr: Point) => {
        const a = toCanvasPoint(prev);
        const b = toCanvasPoint(curr);
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const dt = curr.dt > 0 ? curr.dt : 1;
        return dist / dt;
    };

    const getToolSettings = (tool: ToolType) => {
        switch (tool) {
            case ToolType.HIGHLIGHTER:
                return { toolFactor: 1.0, pressureGamma: 0.6, velocityK: 0, usePressureForWidth: false, useVelocity: false };
            case ToolType.MARKER:
                return { toolFactor: 0.8, pressureGamma: 0.85, velocityK: 0.006, usePressureForWidth: true, useVelocity: true };
            case ToolType.PEN:
            default:
                return { toolFactor: 1.0, pressureGamma: 0.6, velocityK: 0.003, usePressureForWidth: true, useVelocity: true };
        }
    };

    const getRenderWidth = (stroke: Stroke, prev: Point, curr: Point) => {
        const { toolFactor, pressureGamma, velocityK, usePressureForWidth, useVelocity } = getToolSettings(stroke.tool);
        const p = smoothPressure(prev.pressure, curr.pressure);
        const velocity = useVelocity ? getVelocity(prev, curr) : 0;
        const velocityFactor = useVelocity ? (1 / (1 + velocity * velocityK)) : 1;
        const pressureFactor = usePressureForWidth ? pressureCurve(p, pressureGamma) : 1;
        return stroke.baseWidth * toolFactor * pressureFactor * velocityFactor;
    };

    const getRenderAlpha = (stroke: Stroke, prev: Point, curr: Point) => {
        if (stroke.tool !== ToolType.HIGHLIGHTER) return 1;
        const p = smoothPressure(prev.pressure, curr.pressure);
        return Math.min(1, Math.max(0.3, 0.3 + p * 0.4));
    };

    const toNormalizedPoint = (x: number, y: number) => ({
        x: x / currentPage.width,
        y: y / currentPage.height
    });

    const toCanvasPoint = (p: Point) => ({
        x: p.x * currentPage.width,
        y: p.y * currentPage.height
    });

    const getEraserRadius = () => currentWidth * 5;

    const boundsIntersect = (bounds: Bounds, center: Point, radiusPx: number) => {
        const rX = radiusPx / currentPage.width;
        const rY = radiusPx / currentPage.height;
        return !(
            center.x + rX < bounds.minX ||
            center.x - rX > bounds.maxX ||
            center.y + rY < bounds.minY ||
            center.y - rY > bounds.maxY
        );
    };

    const distancePointToSegment = (
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

    const segmentHit = (p0: Point, p1: Point, eraserPx: { x: number; y: number }, radiusPx: number) => {
        const a = toCanvasPoint(p0);
        const b = toCanvasPoint(p1);
        const d = distancePointToSegment(eraserPx.x, eraserPx.y, a.x, a.y, b.x, b.y);
        return d <= radiusPx;
    };

    const generateStrokeId = () =>
        BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000));

    const splitStrokeByEraser = (
        stroke: Stroke,
        eraserPoint: Point,
        radiusPx: number,
        eraserPx: { x: number; y: number }
    ): Stroke[] | null => {
        if (!boundsIntersect(stroke.bounds, eraserPoint, radiusPx)) return null;

        const points = stroke.points;
        if (points.length < 2) return null;

        let hit = false;
        const segments: Point[][] = [];
        let segmentStart = 0;

        for (let i = 0; i < points.length - 1; i++) {
            if (segmentHit(points[i], points[i + 1], eraserPx, radiusPx)) {
                hit = true;
                if (i - segmentStart >= 1) {
                    segments.push(points.slice(segmentStart, i + 1));
                }
                segmentStart = i + 1;
            }
        }

        if (points.length - 1 - segmentStart >= 1) {
            segments.push(points.slice(segmentStart));
        }

        if (!hit) return null;

        return segments.map((segmentPoints) => ({
            ...stroke,
            strokeId: generateStrokeId(),
            points: segmentPoints,
            bounds: StrokeNormalizer.calculateBounds(segmentPoints)
        }));
    };

    const eraseAt = (x: number, y: number) => {
        const eraserPoint: Point = {
            x: x / currentPage.width,
            y: y / currentPage.height,
            pressure: 1,
            dt: 0
        };
        const radiusPx = getEraserRadius();
        const eraserPx = { x, y };

        let changed = false;
        const nextStrokes: Stroke[] = [];

        for (const stroke of strokes) {
            if (!boundsIntersect(stroke.bounds, eraserPoint, radiusPx)) {
                nextStrokes.push(stroke);
                continue;
            }

            if (eraserMode === 'stroke') {
                const hit = splitStrokeByEraser(stroke, eraserPoint, radiusPx, eraserPx);
                if (hit) {
                    changed = true;
                    continue;
                }
                nextStrokes.push(stroke);
                continue;
            }

            const split = splitStrokeByEraser(stroke, eraserPoint, radiusPx, eraserPx);
            if (!split) {
                nextStrokes.push(stroke);
                continue;
            }

            changed = true;
            nextStrokes.push(...split);
        }

        if (changed) {
            eraserDidChangeRef.current = true;
            applyStrokes(nextStrokes);
        }
    };

    const createBoundsFromPoint = (p: Point): Bounds => ({
        minX: p.x,
        minY: p.y,
        maxX: p.x,
        maxY: p.y
    });

    const expandBounds = (bounds: Bounds, p: Point) => {
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.maxY = Math.max(bounds.maxY, p.y);
    };

    const ensureCacheCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        if (!cacheCanvasRef.current) {
            const offscreen = document.createElement('canvas');
            offscreen.width = canvas.width;
            offscreen.height = canvas.height;
            cacheCanvasRef.current = offscreen;
        }
        return cacheCanvasRef.current;
    };

    const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        if (stroke.points.length === 0) return;
        ctx.strokeStyle = StrokeNormalizer.uint32ToCSSColor(stroke.colorRGBA);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (stroke.points.length < 2) return;
        if (stroke.points.length === 2) {
            const p0 = stroke.points[0];
            const p1 = stroke.points[1];
            const a = toCanvasPoint(p0);
            const b = toCanvasPoint(p1);
            ctx.beginPath();
            ctx.lineWidth = getRenderWidth(stroke, p0, p1);
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
            const start = midpointCanvas(p0, p1);
            const end = midpointCanvas(p1, p2);
            const control = toCanvasPoint(p1);

            ctx.beginPath();
            ctx.lineWidth = getRenderWidth(stroke, p0, p1);
            ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
            ctx.moveTo(start.x, start.y);
            ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    };

    const rebuildCacheFromStrokes = () => {
        const cacheCanvas = ensureCacheCanvas();
        if (!cacheCanvas) return;
        const cacheCtx = cacheCanvas.getContext('2d');
        if (!cacheCtx) return;
        cacheCtx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
        for (const stroke of strokes) {
            drawStroke(cacheCtx, stroke);
        }
    };

    const drawCacheToMain = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cacheCanvas = ensureCacheCanvas();
        if (cacheCanvas) {
            ctx.drawImage(cacheCanvas, 0, 0);
        }
    };

    const applyStrokes = (nextStrokes: Stroke[]) => {
        setStrokes(nextStrokes);
        setCurrentPage(prev => ({
            ...prev,
            modifiedTimestamp: BigInt(Date.now()),
            layers: prev.layers.map((layer, idx) =>
                idx === 0
                    ? { ...layer, strokes: nextStrokes }
                    : layer
            )
        }));
    };

    const pushCommand = (before: Stroke[], after: Stroke[]) => {
        undoStackRef.current.push({ before, after });
        redoStackRef.current = [];
        setUndoCount(undoStackRef.current.length);
        setRedoCount(0);
    };

    const handleUndo = () => {
        const cmd = undoStackRef.current.pop();
        if (!cmd) return;
        redoStackRef.current.push(cmd);
        applyStrokes(cmd.before);
        setUndoCount(undoStackRef.current.length);
        setRedoCount(redoStackRef.current.length);
    };

    const handleRedo = () => {
        const cmd = redoStackRef.current.pop();
        if (!cmd) return;
        undoStackRef.current.push(cmd);
        applyStrokes(cmd.after);
        setUndoCount(undoStackRef.current.length);
        setRedoCount(redoStackRef.current.length);
    };

    const drawLiveSegment = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
        const points = stroke.points;
        const len = points.length;
        if (len < 2) return;

        ctx.strokeStyle = StrokeNormalizer.uint32ToCSSColor(stroke.colorRGBA);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (len === 2) {
            const p0 = points[0];
            const p1 = points[1];
            const a = toCanvasPoint(p0);
            const b = toCanvasPoint(p1);
            ctx.beginPath();
            ctx.lineWidth = getRenderWidth(stroke, p0, p1);
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

        const start = midpointCanvas(p0, p1);
        const end = midpointCanvas(p1, p2);
        const control = toCanvasPoint(p1);

        ctx.beginPath();
        ctx.lineWidth = getRenderWidth(stroke, p0, p1);
        ctx.globalAlpha = getRenderAlpha(stroke, p0, p1);
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isReadOnly) return;

        if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') {
            return;
        }
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Capture pointer for smooth tracking
        canvas.setPointerCapture(e.pointerId);
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === ToolType.ERASER) {
            setIsDrawing(true);
            eraserBeforeRef.current = strokesRef.current;
            eraserDidChangeRef.current = false;
            eraseAt(x, y);
            return;
        }

        const normalized = toNormalizedPoint(x, y);
        const point: Point = {
            x: normalized.x,
            y: normalized.y,
            pressure: normalizePressure(e.pressure || 0.5),
            dt: 0,
            tiltX: e.tiltX ?? 0,
            tiltY: e.tiltY ?? 0,
        };

        activeStrokeRef.current = {
            strokeId: 0n,
            tool: currentTool,
            colorRGBA: currentColor,
            baseWidth: currentWidth,
            bounds: createBoundsFromPoint(point),
            points: [point]
        };

        lastPointerTimeRef.current = e.timeStamp;
        setIsDrawing(true);

        drawCacheToMain();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isReadOnly) return;

        if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') {
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentTool === ToolType.ERASER) {
            if (!isDrawing) return;
            eraseAt(x, y);
            return;
        }

        if (!isDrawing) return;

        const normalized = toNormalizedPoint(x, y);
        const lastTime = lastPointerTimeRef.current ?? e.timeStamp;
        const dt = Math.max(0, e.timeStamp - lastTime);
        lastPointerTimeRef.current = e.timeStamp;

        const point: Point = {
            x: normalized.x,
            y: normalized.y,
            pressure: normalizePressure(e.pressure || 0.5),
            dt,
            tiltX: e.tiltX ?? 0,
            tiltY: e.tiltY ?? 0,
        };

        const activeStroke = activeStrokeRef.current;
        if (!activeStroke) return;

        activeStroke.points.push(point);
        expandBounds(activeStroke.bounds, point);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            drawLiveSegment(ctx, activeStroke);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
        }

        setIsDrawing(false);

        if (currentTool === ToolType.ERASER) {
            if (eraserDidChangeRef.current && eraserBeforeRef.current) {
                pushCommand(eraserBeforeRef.current, strokesRef.current);
            }
            eraserBeforeRef.current = null;
            eraserDidChangeRef.current = false;
            activeStrokeRef.current = null;
            return;
        }

        const activeStroke = activeStrokeRef.current;
        if (!activeStroke || activeStroke.points.length === 0) {
            activeStrokeRef.current = null;
            return;
        }

        const strokeId = BigInt(Date.now()) * 1000000n + BigInt(activeStroke.points.length);
        const finalizedStroke: Stroke = {
            ...activeStroke,
            strokeId
        };

        const before = strokesRef.current;
        const after = [...before, finalizedStroke];
        applyStrokes(after);
        pushCommand(before, after);

        const cacheCanvas = ensureCacheCanvas();
        const cacheCtx = cacheCanvas?.getContext('2d');
        if (cacheCtx) {
            drawStroke(cacheCtx, finalizedStroke);
        }
        drawCacheToMain();

        activeStrokeRef.current = null;
    };

    const redrawCanvas = () => {
        drawCacheToMain();
    };

    const handleClear = () => {
        setStrokes([]);
        setCurrentPage(prev => ({
            ...prev,
            modifiedTimestamp: BigInt(Date.now()),
            layers: prev.layers.map(layer => ({ ...layer, strokes: [] }))
        }));
        redrawCanvas();
    };

    const handleExport = async () => {
        try {
            console.log("Exporting...");
            const blob = await TriliumInkSerializer.exportToFile([currentPage]);
            TriliumInkSerializer.downloadFile(blob, `${note.noteId}.trilium-ink`);
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    const handleImport = async () => {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.trilium-ink';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;

                const pages = await TriliumInkSerializer.importFromFile(file);
                if (pages.length > 0) {
                    const importedPage = pages[0];
                    setCurrentPage(importedPage);
                    setStrokes(importedPage.layers[0]?.strokes || []);
                    if (importedPage.paperStyle) {
                        setPaperStyle(importedPage.paperStyle);
                    }
                    console.log('Imported page:', importedPage);
                }
            };
            input.click();
        } catch (error) {
            console.error('Import failed:', error);
        }
    };

    const handleColorChange = (color: string) => {
        // Parse hex color
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        setCurrentColor(StrokeNormalizer.rgbToUint32(r, g, b, 255));
    };

    return (
        <div className="notebook-widget">
            <div className="notebook-toolbar">
                <button 
                    onClick={() => setCurrentTool(ToolType.PEN)}
                    className={currentTool === ToolType.PEN ? 'active' : ''}
                >
                    Pen
                </button>
                <button 
                    onClick={() => setCurrentTool(ToolType.HIGHLIGHTER)}
                    className={currentTool === ToolType.HIGHLIGHTER ? 'active' : ''}
                >
                    Highlighter
                </button>
                <button 
                    onClick={() => setCurrentTool(ToolType.ERASER)}
                    className={currentTool === ToolType.ERASER ? 'active' : ''}
                >
                    Eraser
                </button>
                <button onClick={handleUndo} disabled={undoCount === 0}>
                    Undo
                </button>
                <button onClick={handleRedo} disabled={redoCount === 0}>
                    Redo
                </button>
                <button
                    onClick={() => {
                        setCurrentTool(ToolType.ERASER);
                        setEraserMode('stroke');
                    }}
                    className={eraserMode === 'stroke' ? 'active' : ''}
                    title="Stroke Eraser"
                >
                    Stroke Eraser
                </button>
                <button
                    onClick={() => {
                        setCurrentTool(ToolType.ERASER);
                        setEraserMode('partial');
                    }}
                    className={eraserMode === 'partial' ? 'active' : ''}
                    title="Partial Eraser"
                >
                    Partial Eraser
                </button>
                <input 
                    type="color" 
                    onChange={(e) => handleColorChange(e.target.value)}
                    title="Stroke Color"
                />
                <input 
                    type="range" 
                    min="1" 
                    max="20" 
                    value={currentWidth}
                    onChange={(e) => setCurrentWidth(Number(e.target.value))}
                    title="Stroke Width"
                />
                <button onClick={handleClear}>Clear</button>
                <button onClick={handleImport}>Import</button>
                <button onClick={handleExport}>Export</button>
                <select 
                    value={paperStyle} 
                    onChange={(e) => {
                        const newStyle = e.target.value as PaperStyle;
                        setPaperStyle(newStyle);
                        // Update current page with new paper style
                        setCurrentPage(prev => ({
                            ...prev,
                            paperStyle: newStyle,
                            modifiedTimestamp: BigInt(Date.now())
                        }));
                    }}
                    title="Paper Style"
                >
                    <option value="blank">Blank</option>
                    <option value="lined">Ruled Lines</option>
                    <option value="grid">Grid</option>
                    <option value="dots">Dot Grid</option>
                </select>
            </div>
            
            <div className="notebook-canvas-container">
                <div 
                    className={
                        paperStyle === 'blank' ? 'notebook-paper' :
                        paperStyle === 'lined' ? 'notebook-paper-lined' :
                        paperStyle === 'grid' ? 'notebook-paper-grid' :
                        'notebook-paper-dots'
                    }
                    style={{ display: 'inline-block', position: 'relative' }}
                >
                    <canvas 
                        ref={canvasRef}
                        width={800} 
                        height={1000}
                        style={{ 
                            display: 'block',
                            background: 'transparent',
                            touchAction: 'none',
                            cursor: 'crosshair'
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    >
                        Your browser does not support the HTML5 canvas tag.
                    </canvas>
                </div>
            </div>   
            <div>
                Metadata: {note.noteId} - ReadOnly: {isReadOnly ? "Yes" : "No"} - 
                Strokes: {strokes.length}
            </div>
        </div>
    );
}
