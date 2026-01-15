import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '../type_widget', replacement: path.resolve(__dirname, 'mocks/type_widget.ts') },
      { find: '../../react/hooks', replacement: path.resolve(__dirname, 'mocks/react_hooks.ts') }
    ]
  }
})
