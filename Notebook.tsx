import { useRef, useState, useEffect } from "react";
import { TypeWidgetProps } from "./mocks/type_widget";
import "./Notebook.css";
import "./Paper.css";
import { useNoteLabelBoolean } from "./mocks/react_hooks";
import { StrokeNormalizer } from "./utils/strokeNormalizer";
import { TriliumInkSerializer } from "./utils/serializer";
import { 
    RawPointerEvent, 
    Stroke, 
    Page, 
    ToolType,
    PaperStyle
} from "./types/stroke";

export default function Notebook({ note }: TypeWidgetProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isReadOnly] = useNoteLabelBoolean(note, "readOnly");
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentTool, setCurrentTool] = useState<ToolType>(ToolType.PEN);
    const [currentColor, setCurrentColor] = useState(
        StrokeNormalizer.rgbToUint32(0, 0, 0, 255)
    );
    const [currentWidth, setCurrentWidth] = useState(2);
    const [paperStyle, setPaperStyle] = useState<'blank' | 'lined' | 'grid' | 'dots'>('lined');
    
    // Current stroke being drawn
    const [currentStrokeEvents, setCurrentStrokeEvents] = useState<RawPointerEvent[]>([]);
    
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
        redrawCanvas();
    }, [strokes]);

    // Sync paper style with current page
    useEffect(() => {
        if (currentPage.paperStyle && currentPage.paperStyle !== paperStyle) {
            setPaperStyle(currentPage.paperStyle);
        }
    }, [currentPage]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isReadOnly) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Capture pointer for smooth tracking
        canvas.setPointerCapture(e.pointerId);
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pointerEvent: RawPointerEvent = {
            x,
            y,
            pressure: e.pressure || 0.5,
            timestamp: Date.now(),
            tiltX: e.tiltX,
            tiltY: e.tiltY,
        };

        setIsDrawing(true);
        setCurrentStrokeEvents([pointerEvent]);

        // Start drawing
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing || isReadOnly) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pointerEvent: RawPointerEvent = {
            x,
            y,
            pressure: e.pressure || 0.5,
            timestamp: Date.now(),
            tiltX: e.tiltX,
            tiltY: e.tiltY,
        };

        setCurrentStrokeEvents(prev => [...prev, pointerEvent]);

        // Draw line
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const color = StrokeNormalizer.uint32ToCSSColor(currentColor);
            ctx.strokeStyle = color;
            ctx.lineWidth = currentWidth * (e.pressure || 0.5);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.releasePointerCapture(e.pointerId);
        }

        setIsDrawing(false);

        // Normalize and save the stroke
        if (currentStrokeEvents.length > 0) {
            const normalizedStroke = StrokeNormalizer.normalizeStroke(
                currentStrokeEvents,
                currentTool,
                currentColor,
                currentWidth,
                true, // Enable simplification
                0.5   // Epsilon for Douglas-Peucker
            );

            setStrokes(prev => [...prev, normalizedStroke]);
            
            // Update page
            setCurrentPage(prev => ({
                ...prev,
                modifiedTimestamp: BigInt(Date.now()),
                layers: prev.layers.map((layer, idx) => 
                    idx === 0 
                        ? { ...layer, strokes: [...layer.strokes, normalizedStroke] }
                        : layer
                )
            }));
        }

        setCurrentStrokeEvents([]);
    };

    const redrawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw all strokes
        for (const stroke of strokes) {
            if (stroke.points.length === 0) continue;

            ctx.beginPath();
            ctx.strokeStyle = StrokeNormalizer.uint32ToCSSColor(stroke.colorRGBA);
            ctx.lineWidth = stroke.baseWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                const point = stroke.points[i];
                // Optionally vary width by pressure
                ctx.lineWidth = stroke.baseWidth * point.pressure;
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
            }
        }
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
