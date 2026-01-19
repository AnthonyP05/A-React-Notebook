import { useRef, useState, useEffect } from "react";
import { TypeWidgetProps } from "./mocks/type_widget";
import "./Notebook.css";
import "./Paper.css";
import { useNoteLabelBoolean } from "./mocks/react_hooks";
import { StrokeNormalizer } from "./utils/strokeNormalizer";
import { TriliumInkSerializer } from "./utils/serializer";
import { Stroke, Page, ToolType, PaperStyle, Point } from "./types/stroke";
import { toNormalizedPoint, createBoundsFromPoint, expandBounds } from "./geometry/coordinates";
import { normalizePressure } from "./tools/pressure";
import { eraseStrokes, generateStrokeId } from "./tools/eraser";
import { drawLiveSegment } from "./rendering/strokeRenderer";
import { TileCache } from "./rendering/tileCache";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { Toolbar } from "./ui/Toolbar";
import { NotebookCanvas } from "./ui/NotebookCanvas";

export default function Notebook({ note }: TypeWidgetProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activeStrokeRef = useRef<Stroke | null>(null);
    const lastPointerTimeRef = useRef<number | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const eraserBeforeRef = useRef<Stroke[] | null>(null);
    const tileCacheRef = useRef<TileCache | null>(null);
    
    const [isReadOnly] = useNoteLabelBoolean(note, "readOnly");
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentTool, setCurrentTool] = useState<ToolType>(ToolType.PEN);
    const [eraserMode, setEraserMode] = useState<'stroke' | 'partial'>('partial');
    const [currentColor, setCurrentColor] = useState(
        StrokeNormalizer.rgbToUint32(0, 0, 0, 255)
    );
    const [currentWidth, setCurrentWidth] = useState(2);
    const [paperStyle, setPaperStyle] = useState<'blank' | 'lined' | 'grid' | 'dots'>('lined');
    
    const { pushCommand, undo, redo, undoCount, redoCount } = useUndoRedo();
    
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

    // Initialize tile cache
    useEffect(() => {
        tileCacheRef.current = new TileCache(512, currentPage.width, currentPage.height);
    }, []);

    // Redraw canvas when strokes change
    useEffect(() => {
        strokesRef.current = strokes;
        const cache = tileCacheRef.current;
        if (!cache) return;
        
        if (strokes.length > 0 && cache.indexSize === 0) {
            cache.rebuildFromStrokes(strokes);
        }
        const canvas = canvasRef.current;
        if (canvas) {
            cache.drawToCanvas(canvas);
        }
    }, [strokes]);

    // Rebuild tiles when page size changes
    useEffect(() => {
        const cache = tileCacheRef.current;
        if (!cache) return;
        
        cache.updatePageSize(currentPage.width, currentPage.height);
        cache.rebuildFromStrokes(strokes);
        const canvas = canvasRef.current;
        if (canvas) {
            cache.drawToCanvas(canvas);
        }
    }, [currentPage.width, currentPage.height]);

    // Sync paper style with current page
    useEffect(() => {
        if (currentPage.paperStyle && currentPage.paperStyle !== paperStyle) {
            setPaperStyle(currentPage.paperStyle);
        }
    }, [currentPage]);

    const getEraserRadius = () => currentWidth * 5;

    const applyStrokes = (nextStrokes: Stroke[]) => {
        const before = strokesRef.current;
        const cache = tileCacheRef.current;
        if (cache) {
            cache.applyStrokeDiff(before, nextStrokes);
        }
        
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

    const handleUndo = () => {
        const result = undo();
        if (result) {
            applyStrokes(result);
        }
    };

    const handleRedo = () => {
        const result = redo();
        if (result) {
            applyStrokes(result);
        }
    };

    const redrawCanvas = () => {
        const canvas = canvasRef.current;
        const cache = tileCacheRef.current;
        if (canvas && cache) {
            cache.drawToCanvas(canvas);
        }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isReadOnly) return;

        if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') {
            return;
        }
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.setPointerCapture(e.pointerId);
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const normalized = toNormalizedPoint(x, y, currentPage.width, currentPage.height);
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

        if (currentTool === ToolType.ERASER) {
            eraserBeforeRef.current = strokesRef.current;
            // For eraser, baseWidth is the visual width of the path, but algorithm uses getEraserRadius()
            // We set it here for visual feedback
            activeStrokeRef.current.baseWidth = getEraserRadius() / 2; 
        }

        lastPointerTimeRef.current = e.timeStamp;
        setIsDrawing(true);

        redrawCanvas();
        // Draw the initial point (needed for dots)
        const ctx = canvas.getContext('2d');
        if (ctx) {
            drawLiveSegment(ctx, activeStrokeRef.current, currentPage.width, currentPage.height);
        }
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

        if (!isDrawing) return;

        const normalized = toNormalizedPoint(x, y, currentPage.width, currentPage.height);
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
             drawLiveSegment(ctx, activeStroke, currentPage.width, currentPage.height);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
        }

        setIsDrawing(false);

        const activeStroke = activeStrokeRef.current;
        if (!activeStroke || activeStroke.points.length === 0) {
            activeStrokeRef.current = null;
            return;
        }

        if (currentTool === ToolType.ERASER) {
            // Perform atomic erase on pointer up
            const result = eraseStrokes(
                strokes,
                activeStroke,
                eraserMode,
                getEraserRadius(),
                currentPage.width,
                currentPage.height
            );

            if (result.changed) {
                applyStrokes(result.nextStrokes);
                if (eraserBeforeRef.current) {
                    pushCommand(eraserBeforeRef.current, result.nextStrokes);
                }
            } else {
                // If nothing changed, we might still want to redraw to clear the eraser path visual
                redrawCanvas();
            }
            
            eraserBeforeRef.current = null;
            activeStrokeRef.current = null;
            return;
        }

        const strokeId = generateStrokeId();
        const finalizedStroke: Stroke = {
            ...activeStroke,
            strokeId
        };

        const before = strokesRef.current;
        const after = [...before, finalizedStroke];
        applyStrokes(after);
        pushCommand(before, after);

        redrawCanvas();

        activeStrokeRef.current = null;
    };

    const handleClear = () => {
        applyStrokes([]);
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
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        setCurrentColor(StrokeNormalizer.rgbToUint32(r, g, b, 255));
    };

    const handlePaperStyleChange = (style: PaperStyle) => {
        setPaperStyle(style);
        setCurrentPage(prev => ({
            ...prev,
            paperStyle: style,
            modifiedTimestamp: BigInt(Date.now())
        }));
    };

    return (
        <div className="notebook-widget">
            <Toolbar 
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                eraserMode={eraserMode}
                setEraserMode={setEraserMode}
                undoCount={undoCount}
                redoCount={redoCount}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onColorChange={handleColorChange}
                currentWidth={currentWidth}
                onWidthChange={setCurrentWidth}
                onClear={handleClear}
                onImport={handleImport}
                onExport={handleExport}
                paperStyle={paperStyle}
                onPaperStyleChange={handlePaperStyleChange}
            />
            
            <NotebookCanvas 
                ref={canvasRef}
                width={currentPage.width}
                height={currentPage.height}
                paperStyle={paperStyle}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            />   
            <div>
                Metadata: {note.noteId} - ReadOnly: {isReadOnly ? "Yes" : "No"} - 
                Strokes: {strokes.length}
            </div>
        </div>
    );
}
