import { ToolType } from "../types/stroke";

export interface ToolSettings {
    toolFactor: number;
    pressureGamma: number;
    velocityK: number;
    usePressureForWidth: boolean;
    useVelocity: boolean;
}

export const getToolSettings = (tool: ToolType): ToolSettings => {
    switch (tool) {
        case ToolType.HIGHLIGHTER:
            return { 
                toolFactor: 1.0, 
                pressureGamma: 0.6, 
                velocityK: 0, 
                usePressureForWidth: false, 
                useVelocity: false 
            };
        case ToolType.MARKER:
            return { 
                toolFactor: 0.8, 
                pressureGamma: 0.85, 
                velocityK: 0.006, 
                usePressureForWidth: true, 
                useVelocity: true 
            };
        case ToolType.PEN:
        default:
            return { 
                toolFactor: 1.0, 
                pressureGamma: 0.6, 
                velocityK: 0.003, 
                usePressureForWidth: true, 
                useVelocity: true 
            };
    }
};
