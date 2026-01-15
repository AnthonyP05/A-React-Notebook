import React from 'react'
import ReactDOM from 'react-dom/client'
import Notebook from './Notebook'
import './Notebook.css'

// Mock data for the notebook
const mockNote = {
  noteId: 'mock-note-id-123',
  title: 'Test Notebook Note',
  attributes: []
};

const mockNoteContext = {
  // Add any context props usually provided by Trilium here
  backendUrl: 'http://localhost:8080'
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ padding: '20px', background: '#f0f0f0', minHeight: '100vh' }}>
      <h1>Trilium Addon Dev Area</h1>
      <Notebook note={mockNote} noteContext={mockNoteContext} />
    </div>
  </React.StrictMode>,
)
