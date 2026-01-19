import { useRef, useState } from "react";
import { Stroke } from "../types/stroke";

export interface UndoCommand {
    before: Stroke[];
    after: Stroke[];
}

export const useUndoRedo = () => {
    const undoStackRef = useRef<UndoCommand[]>([]);
    const redoStackRef = useRef<UndoCommand[]>([]);
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);

    const pushCommand = (before: Stroke[], after: Stroke[]) => {
        undoStackRef.current.push({ before, after });
        redoStackRef.current = [];
        setUndoCount(undoStackRef.current.length);
        setRedoCount(0);
    };

    const undo = (): Stroke[] | null => {
        const cmd = undoStackRef.current.pop();
        if (!cmd) return null;
        redoStackRef.current.push(cmd);
        setUndoCount(undoStackRef.current.length);
        setRedoCount(redoStackRef.current.length);
        return cmd.before;
    };

    const redo = (): Stroke[] | null => {
        const cmd = redoStackRef.current.pop();
        if (!cmd) return null;
        undoStackRef.current.push(cmd);
        setUndoCount(undoStackRef.current.length);
        setRedoCount(redoStackRef.current.length);
        return cmd.after;
    };

    return {
        pushCommand,
        undo,
        redo,
        undoCount,
        redoCount
    };
};
