import { ToolType, PaperStyle } from "../types/stroke";

interface ToolbarProps {
    currentTool: ToolType;
    setCurrentTool: (tool: ToolType) => void;
    eraserMode: 'stroke' | 'partial';
    setEraserMode: (mode: 'stroke' | 'partial') => void;
    undoCount: number;
    redoCount: number;
    onUndo: () => void;
    onRedo: () => void;
    onColorChange: (color: string) => void;
    currentWidth: number;
    onWidthChange: (width: number) => void;
    onClear: () => void;
    onImport: () => void;
    onExport: () => void;
    paperStyle: PaperStyle;
    onPaperStyleChange: (style: PaperStyle) => void;
}

export const Toolbar = ({
    currentTool,
    setCurrentTool,
    eraserMode,
    setEraserMode,
    undoCount,
    redoCount,
    onUndo,
    onRedo,
    onColorChange,
    currentWidth,
    onWidthChange,
    onClear,
    onImport,
    onExport,
    paperStyle,
    onPaperStyleChange
}: ToolbarProps) => {
    return (
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
            <button onClick={onUndo} disabled={undoCount === 0}>
                Undo
            </button>
            <button onClick={onRedo} disabled={redoCount === 0}>
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
                onChange={(e) => onColorChange(e.target.value)}
                title="Stroke Color"
            />
            <input 
                type="range" 
                min="1" 
                max="20" 
                value={currentWidth}
                onChange={(e) => onWidthChange(Number(e.target.value))}
                title="Stroke Width"
            />
            <button onClick={onClear}>Clear</button>
            <button onClick={onImport}>Import</button>
            <button onClick={onExport}>Export</button>
            <select 
                value={paperStyle} 
                onChange={(e) => onPaperStyleChange(e.target.value as PaperStyle)}
                title="Paper Style"
            >
                <option value="blank">Blank</option>
                <option value="lined">Ruled Lines</option>
                <option value="grid">Grid</option>
                <option value="dots">Dot Grid</option>
            </select>
        </div>
    );
};
