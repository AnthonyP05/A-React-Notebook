import { Stroke, Bounds } from "../types/stroke";
import { strokeBoundsPx } from "../geometry/coordinates";
import { drawStroke } from "./strokeRenderer";

export interface Tile {
    canvas: HTMLCanvasElement;
    dirty: boolean;
}

export class TileCache {
    private tiles: Map<string, Tile> = new Map();
    private tileIndex: Map<string, Set<bigint>> = new Map();
    private strokeMap: Map<bigint, Stroke> = new Map();
    private tileSize: number;
    private pageWidth: number;
    private pageHeight: number;

    constructor(tileSize: number, pageWidth: number, pageHeight: number) {
        this.tileSize = tileSize;
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
    }

    updatePageSize(width: number, height: number) {
        this.pageWidth = width;
        this.pageHeight = height;
    }

    getTileKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    getTileBoundsPx(tileX: number, tileY: number) {
        return {
            minX: tileX * this.tileSize,
            minY: tileY * this.tileSize,
            maxX: (tileX + 1) * this.tileSize,
            maxY: (tileY + 1) * this.tileSize
        };
    }

    getTilesForBounds(boundsPx: { minX: number; minY: number; maxX: number; maxY: number }) {
        const startX = Math.floor(boundsPx.minX / this.tileSize);
        const endX = Math.floor(boundsPx.maxX / this.tileSize);
        const startY = Math.floor(boundsPx.minY / this.tileSize);
        const endY = Math.floor(boundsPx.maxY / this.tileSize);
        const tiles: Array<{ x: number; y: number }> = [];
        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                tiles.push({ x, y });
            }
        }
        return tiles;
    }

    ensureTile(tileX: number, tileY: number): Tile {
        const key = this.getTileKey(tileX, tileY);
        const existing = this.tiles.get(key);
        if (existing) return existing;
        const canvas = document.createElement('canvas');
        canvas.width = this.tileSize;
        canvas.height = this.tileSize;
        const tile = { canvas, dirty: true };
        this.tiles.set(key, tile);
        return tile;
    }

    markTilesDirtyForBounds(bounds: Bounds) {
        const boundsPx = strokeBoundsPx(bounds, this.pageWidth, this.pageHeight);
        const tiles = this.getTilesForBounds(boundsPx);
        for (const { x, y } of tiles) {
            const tile = this.ensureTile(x, y);
            tile.dirty = true;
        }
    }

    renderTile(tileX: number, tileY: number, tile: Tile) {
        const ctx = tile.canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, this.tileSize, this.tileSize);
        const key = this.getTileKey(tileX, tileY);
        const strokeIds = this.tileIndex.get(key);
        if (!strokeIds || strokeIds.size === 0) return;

        const tileBounds = this.getTileBoundsPx(tileX, tileY);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, this.tileSize, this.tileSize);
        ctx.clip();
        ctx.translate(-tileBounds.minX, -tileBounds.minY);

        for (const id of strokeIds) {
            const stroke = this.strokeMap.get(id);
            if (!stroke) continue;
            drawStroke(ctx, stroke, this.pageWidth, this.pageHeight);
        }

        ctx.restore();
        tile.dirty = false;
    }

    rebuildFromStrokes(strokes: Stroke[]) {
        this.tiles.clear();
        this.tileIndex.clear();
        this.strokeMap.clear();

        for (const stroke of strokes) {
            this.strokeMap.set(stroke.strokeId, stroke);
            const boundsPx = strokeBoundsPx(stroke.bounds, this.pageWidth, this.pageHeight);
            const tiles = this.getTilesForBounds(boundsPx);
            for (const { x, y } of tiles) {
                const key = this.getTileKey(x, y);
                const set = this.tileIndex.get(key) ?? new Set<bigint>();
                set.add(stroke.strokeId);
                this.tileIndex.set(key, set);
                this.ensureTile(x, y).dirty = true;
            }
        }
    }

    drawToCanvas(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const [key, tile] of this.tiles.entries()) {
            const [xStr, yStr] = key.split(',');
            const tileX = Number(xStr);
            const tileY = Number(yStr);
            if (tile.dirty) {
                this.renderTile(tileX, tileY, tile);
            }
            ctx.drawImage(tile.canvas, tileX * this.tileSize, tileY * this.tileSize);
        }
    }

    applyStrokeDiff(before: Stroke[], after: Stroke[]) {
        const beforeMap = new Map<bigint, Stroke>(before.map(s => [s.strokeId, s]));
        const afterMap = new Map<bigint, Stroke>(after.map(s => [s.strokeId, s]));

        // Remove deleted strokes
        for (const [id, stroke] of beforeMap.entries()) {
            if (afterMap.has(id)) continue;
            const boundsPx = strokeBoundsPx(stroke.bounds, this.pageWidth, this.pageHeight);
            const tiles = this.getTilesForBounds(boundsPx);
            for (const { x, y } of tiles) {
                const key = this.getTileKey(x, y);
                const set = this.tileIndex.get(key);
                if (set) {
                    set.delete(id);
                    if (set.size === 0) {
                        this.tileIndex.delete(key);
                    }
                }
                const tile = this.ensureTile(x, y);
                tile.dirty = true;
            }
        }

        // Add new strokes
        for (const [id, stroke] of afterMap.entries()) {
            if (beforeMap.has(id)) continue;
            const boundsPx = strokeBoundsPx(stroke.bounds, this.pageWidth, this.pageHeight);
            const tiles = this.getTilesForBounds(boundsPx);
            for (const { x, y } of tiles) {
                const key = this.getTileKey(x, y);
                const set = this.tileIndex.get(key) ?? new Set<bigint>();
                set.add(id);
                this.tileIndex.set(key, set);
                const tile = this.ensureTile(x, y);
                tile.dirty = true;
            }
        }

        this.strokeMap = afterMap;
    }

    get indexSize(): number {
        return this.tileIndex.size;
    }
}
