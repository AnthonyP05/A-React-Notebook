import { TypeWidgetProps } from "../type_widget";
import "./Notebook.css";
import { useNoteLabelBoolean } from "../../react/hooks";

export default function Notebook({ note, noteContext }: TypeWidgetProps) {
    const [ isReadOnly ] = useNoteLabelBoolean(note, "readOnly");

    const handlePointerDown = (e) => {
    console.log('Pointer Type:', e.pointerType); // Logs 'mouse', 'pen', 'touch'
    if (e.pointerType === 'pen') {
      console.log('Pen is being used!');
      // You can also access pressure, tilt, etc. here
      console.log('Pressure:', e.pressure);
      console.log('Tilt:', e.tiltX, e.tiltY);
    }
  }

    return (
        <div className="notebook-widget">
            <div className="notebook-toolbar">
                <button>Pen</button>
                <button>Eraser</button>
            </div>

            <div className="pen-info">
                
            </div>
            <div className="notebook-canvas-container">
                <canvas 
                    width={800} 
                    height={1000} 
                    style={{ border: "1px solid #ccc", background: "white" }}
                >
                    Your browser does not support the HTML5 canvas tag.
                </canvas>
            </div>
            <div>
                Metadata: {note.noteId} - ReadOnly: {isReadOnly ? "Yes" : "No"}
            </div>
        </div>
    );
}
