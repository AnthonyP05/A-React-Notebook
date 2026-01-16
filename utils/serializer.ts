import JSZip from 'jszip';
import { Page, Manifest, StrokeIndexEntry, PageIndexEntry } from '../types/stroke';

/**
 * Serializes Trilium Ink data to protobuf format and packages into .trilium-ink ZIP
 * Note: This is a simplified implementation. For production, use protobufjs to encode
 * the actual protobuf binary format.
 */
export class TriliumInkSerializer {
  /**
   * Export pages to a .trilium-ink file (ZIP container)
   */
  static async exportToFile(pages: Page[]): Promise<Blob> {
    const zip = new JSZip();

    // Create manifest
    const manifest = this.createManifest(pages);
    zip.file('manifest.pb', this.encodeManifest(manifest));

    // Create page files
    const pagesFolder = zip.folder('pages');
    if (!pagesFolder) throw new Error('Failed to create pages folder');

    for (const page of pages) {
      const pageFileName = `page-${String(page.pageId).padStart(4, '0')}.pb`;
      pagesFolder.file(pageFileName, this.encodePage(page));
    }

    // Create indexes
    const indexesFolder = zip.folder('indexes');
    if (!indexesFolder) throw new Error('Failed to create indexes folder');

    const pageIndex = this.createPageIndex(pages);
    const strokeIndex = this.createStrokeIndex(pages);

    indexesFolder.file('page-index.pb', this.encodePageIndex(pageIndex));
    indexesFolder.file('stroke-index.pb', this.encodeStrokeIndex(strokeIndex));

    // Create thumbs folder (empty for now)
    zip.folder('thumbs');

    // Generate ZIP blob
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Import from .trilium-ink file
   */
  static async importFromFile(blob: Blob): Promise<Page[]> {
    const zip = await JSZip.loadAsync(blob);
    const pages: Page[] = [];

    // Read all page files
    const pageFiles = Object.keys(zip.files).filter(name => name.startsWith('pages/page-'));

    for (const pageFile of pageFiles) {
      const content = await zip.files[pageFile].async('uint8array');
      const page = this.decodePage(content);
      pages.push(page);
    }

    return pages.sort((a, b) => a.pageId - b.pageId);
  }

  private static createManifest(pages: Page[]): Manifest {
    const totalStrokes = pages.reduce(
      (sum, page) => sum + page.layers.reduce((layerSum, layer) => layerSum + layer.strokes.length, 0),
      0
    );
    
    return {
      version: 1,
      createdBy: 'Trilium Notebook Addon v0.1',
      createdTimestamp: BigInt(Date.now()),
      pageCount: pages.length,
      totalStrokes,
    };
  }

  private static createPageIndex(pages: Page[]): PageIndexEntry[] {
    return pages.map(page => ({
      pageId: page.pageId,
      title: `Page ${page.pageId}`,
      createdTimestamp: page.createdTimestamp,
      modifiedTimestamp: page.modifiedTimestamp,
    }));
  }

  private static createStrokeIndex(pages: Page[]): StrokeIndexEntry[] {
    const entries: StrokeIndexEntry[] = [];

    for (const page of pages) {
      for (const layer of page.layers) {
        for (const stroke of layer.strokes) {
          entries.push({
            strokeId: stroke.strokeId,
            pageId: page.pageId,
            bounds: stroke.bounds,
          });
        }
      }
    }

    return entries;
  }

  // Simplified encoding methods (use protobufjs for actual protobuf encoding)
  private static encodeManifest(manifest: Manifest): Uint8Array {
    const json = JSON.stringify({
        ...manifest,
        createdTimestamp: manifest.createdTimestamp.toString()
    });
    return new TextEncoder().encode(json);
  }

  private static encodePage(page: Page): Uint8Array {
    // Serialize page to JSON (temporary - should use protobuf)
    const serializable = {
      ...page,
      createdTimestamp: page.createdTimestamp.toString(),
      modifiedTimestamp: page.modifiedTimestamp.toString(),
      layers: page.layers.map(layer => ({
        ...layer,
        strokes: layer.strokes.map(stroke => ({
          ...stroke,
          strokeId: stroke.strokeId.toString(),
        })),
      })),
    };
    const json = JSON.stringify(serializable);
    return new TextEncoder().encode(json);
  }

  private static encodePageIndex(index: PageIndexEntry[]): Uint8Array {
    const serializable = index.map(entry => ({
      ...entry,
      createdTimestamp: entry.createdTimestamp.toString(),
      modifiedTimestamp: entry.modifiedTimestamp.toString(),
    }));
    const json = JSON.stringify(serializable);
    return new TextEncoder().encode(json);
  }

  private static encodeStrokeIndex(index: StrokeIndexEntry[]): Uint8Array {
    const serializable = index.map(entry => ({
      ...entry,
      strokeId: entry.strokeId.toString(),
    }));
    const json = JSON.stringify(serializable);
    return new TextEncoder().encode(json);
  }

  private static decodePage(data: Uint8Array): Page {
    const json = new TextDecoder().decode(data);
    const parsed = JSON.parse(json);

    return {
      ...parsed,
      createdTimestamp: BigInt(parsed.createdTimestamp),
      modifiedTimestamp: BigInt(parsed.modifiedTimestamp),
      layers: parsed.layers.map((layer: any) => ({
        ...layer,
        strokes: layer.strokes.map((stroke: any) => ({
          ...stroke,
          strokeId: BigInt(stroke.strokeId),
        })),
      })),
    };
  }

  /**
   * Download the blob as a file
   */
  static downloadFile(blob: Blob, filename: string = 'notebook.trilium-ink') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
