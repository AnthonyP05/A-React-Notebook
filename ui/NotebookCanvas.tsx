import { forwardRef } from "react";
import { PaperStyle } from "../types/stroke";

interface NotebookCanvasProps {
    width: number;
    height: number;
    paperStyle: PaperStyle;
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

export const NotebookCanvas = forwardRef<HTMLCanvasElement, NotebookCanvasProps>(
    ({ width, height, paperStyle, onPointerDown, onPointerMove, onPointerUp }, ref) => {
        const getPaperClass = () => {
            switch (paperStyle) {
                case 'blank': return 'notebook-paper';
                case 'lined': return 'notebook-paper-lined';
                case 'grid': return 'notebook-paper-grid';
                case 'dots': return 'notebook-paper-dots';
                default: return 'notebook-paper';
            }
        };

        return (
            <div className="notebook-canvas-container">
                <div 
                    className={getPaperClass()}
                    style={{ display: 'inline-block', position: 'relative' }}
                >
                    <canvas 
                        ref={ref}
                        width={width} 
                        height={height}
                        style={{ 
                            display: 'block',
                            background: 'transparent',
                            touchAction: 'none',
                            cursor: 'crosshair'
                        }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    >
                        Your browser does not support the HTML5 canvas tag.
                    </canvas>
                </div>
            </div>
        );
    }
);

NotebookCanvas.displayName = 'NotebookCanvas';
