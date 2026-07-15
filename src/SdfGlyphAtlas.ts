import { DEFAULT_SDF_CUTOFF, getSdfGlyphPadding, SdfTransform } from './sdf.js';
import type { SdfGlyph, SdfGlyphAtlasOptions, SdfGlyphAtlasResult, SdfGlyphBatchResult } from './types.js';

const MIN_ATLAS_ENTRY_SIZE = 4;

type ScratchContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type ScratchCanvas = {
    width: number;
    height: number;
    getContext(contextId: '2d', options?: { willReadFrequently?: boolean }): ScratchContext | null;
};

/**
 * Generates and packs renderer-independent, single-channel SDF glyph cells.
 *
 * An atlas is insertion-only and owns no GPU resources. Callers are responsible
 * for text shaping, layout, texture uploads, and recreating GPU-side state.
 */
export class SdfGlyphAtlas {
    /** Width and height of this square atlas, in pixels. */
    readonly size: number;
    /** CSS Canvas2D font shorthand used by this atlas. */
    readonly font: string;
    /** Configured font size, in CSS pixels. */
    readonly fontSize: number;
    /** Signed-distance radius, in pixels. */
    readonly sdfRadius: number;
    /** Normalized inside-edge cutoff. */
    readonly cutoff: number;
    /** Maximum number of glyphs accepted by the atlas. */
    readonly maxGlyphs: number;
    /** Padding around ink in every non-blank glyph cell. */
    readonly padding: number;

    private readonly entries = new Map<string, SdfGlyph>();
    private readonly entriesByIndex: SdfGlyph[] = [];
    private packX = 0;
    private packY = 0;
    private packRowHeight = 0;
    private scratchCanvas: ScratchCanvas | null = null;
    private scratchContext: ScratchContext | null = null;
    private readonly sdfTransform = new SdfTransform();

    /** Creates an empty, fixed-size atlas. Canvas allocation remains lazy. */
    constructor(options: SdfGlyphAtlasOptions) {
        this.size = validatePositiveInteger(options.size, 'size');
        this.font = validateNonEmptyString(options.font, 'font');
        this.fontSize = validatePositiveNumber(options.fontSize, 'fontSize');
        this.sdfRadius = validatePositiveNumber(options.sdfRadius, 'sdfRadius');
        this.cutoff = validateCutoff(options.cutoff ?? DEFAULT_SDF_CUTOFF);
        this.maxGlyphs =
            options.maxGlyphs === undefined
                ? Number.POSITIVE_INFINITY
                : validatePositiveInteger(options.maxGlyphs, 'maxGlyphs');
        this.padding = getSdfGlyphPadding(this.fontSize, this.sdfRadius);
    }

    /** Number of cached glyphs. */
    get glyphCount(): number {
        return this.entriesByIndex.length;
    }

    /** Returns the glyph stored under `key`, if present. */
    getGlyph(key: string): SdfGlyph | undefined {
        return this.entries.get(key);
    }

    /** Returns the glyph at a stable insertion index, if present. */
    getGlyphByIndex(index: number): SdfGlyph | undefined {
        return this.entriesByIndex[index];
    }

    /** Returns a snapshot of all cached glyphs in stable index order. */
    glyphs(): readonly SdfGlyph[] {
        return this.entriesByIndex.slice();
    }

    /** Returns an existing glyph or measures, rasterizes, and inserts a new one. */
    getOrCreateGlyph(key: string): SdfGlyphAtlasResult {
        validateNonEmptyString(key, 'key');
        const existing = this.entries.get(key);
        if (existing) {
            return { glyph: existing, created: false };
        }
        if (this.entriesByIndex.length >= this.maxGlyphs) {
            throw new Error(`SDF glyph atlas glyph count exceeds maxGlyphs ${this.maxGlyphs}.`);
        }

        const measured = this.measureGlyph(key);
        const position = this.previewPack(measured.width, measured.height);
        const pixels = measured.hasInk
            ? this.rasterizeGlyph(key, measured.width, measured.height, measured.xOffset, measured.drawBaselineY)
            : new Uint8Array(measured.width * measured.height);
        const glyph: SdfGlyph = Object.freeze({
            key,
            index: this.entriesByIndex.length,
            x: position.x,
            y: position.y,
            width: measured.width,
            height: measured.height,
            bitmapX: measured.hasInk ? this.padding : 0,
            bitmapY: measured.hasInk ? this.padding : 0,
            bitmapWidth: measured.bitmapWidth,
            bitmapHeight: measured.bitmapHeight,
            xOffset: measured.xOffset,
            yOffset: measured.yOffset,
            xAdvance: measured.xAdvance,
            pixels,
        });

        this.commitPack(position, measured.width, measured.height);
        this.entries.set(key, glyph);
        this.entriesByIndex.push(glyph);
        return { glyph, created: true };
    }

    /**
     * Resolves a batch in input order and reports newly inserted glyphs.
     * Any failure rolls back all glyphs and packing changes made by this call.
     */
    getOrCreateGlyphs(keys: Iterable<string>): SdfGlyphBatchResult {
        const glyphs: SdfGlyph[] = [];
        const created: SdfGlyph[] = [];
        const initialGlyphCount = this.entriesByIndex.length;
        const initialPackX = this.packX;
        const initialPackY = this.packY;
        const initialPackRowHeight = this.packRowHeight;
        try {
            for (const key of keys) {
                const result = this.getOrCreateGlyph(key);
                glyphs.push(result.glyph);
                if (result.created) {
                    created.push(result.glyph);
                }
            }
        } catch (error) {
            for (const glyph of created) {
                this.entries.delete(glyph.key);
            }
            this.entriesByIndex.length = initialGlyphCount;
            this.packX = initialPackX;
            this.packY = initialPackY;
            this.packRowHeight = initialPackRowHeight;
            throw error;
        }
        return { glyphs, created };
    }

    private measureGlyph(key: string): MeasuredGlyph {
        const context = this.getScratchContext();
        configureContext(context, this.font);
        const metrics = context.measureText(key);
        const glyphLeft = Math.max(0, metrics.actualBoundingBoxLeft);
        const glyphRight = Math.max(0, metrics.actualBoundingBoxRight);
        const glyphTop = Math.max(0, metrics.actualBoundingBoxAscent);
        const glyphBottom = Math.max(0, metrics.actualBoundingBoxDescent);
        const bitmapWidth = Math.ceil(glyphLeft + glyphRight);
        const bitmapHeight = Math.ceil(glyphTop + glyphBottom);
        // WebKit may report a non-zero ink bounding box for whitespace even
        // though fillText produces no pixels. Normalize that browser difference.
        const hasInk = key.trim().length > 0 && bitmapWidth > 0 && bitmapHeight > 0;
        return {
            hasInk,
            width: hasInk ? Math.max(MIN_ATLAS_ENTRY_SIZE, bitmapWidth + this.padding * 2) : MIN_ATLAS_ENTRY_SIZE,
            height: hasInk ? Math.max(MIN_ATLAS_ENTRY_SIZE, bitmapHeight + this.padding * 2) : MIN_ATLAS_ENTRY_SIZE,
            bitmapWidth: hasInk ? bitmapWidth : 0,
            bitmapHeight: hasInk ? bitmapHeight : 0,
            xOffset: hasInk ? -glyphLeft : 0,
            yOffset: hasInk ? -glyphTop : 0,
            xAdvance: metrics.width,
            drawBaselineY: hasInk ? this.padding + glyphTop : 0,
        };
    }

    private rasterizeGlyph(key: string, width: number, height: number, xOffset: number, baselineY: number): Uint8Array {
        const context = this.getScratchContext(width, height);
        configureContext(context, this.font);
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'black';
        context.fillText(key, this.padding - xOffset, baselineY);
        const image = context.getImageData(0, 0, width, height);
        return this.sdfTransform.transformRgba(image.data, width, height, this.sdfRadius, this.cutoff);
    }

    private getScratchContext(requiredWidth = 1, requiredHeight = 1): ScratchContext {
        if (!this.scratchCanvas) {
            this.scratchCanvas = createScratchCanvas(requiredWidth, requiredHeight);
            this.scratchContext = requireCanvasContext(this.scratchCanvas);
            return this.scratchContext;
        }

        if (this.scratchCanvas.width < requiredWidth || this.scratchCanvas.height < requiredHeight) {
            this.scratchCanvas.width = Math.max(this.scratchCanvas.width, requiredWidth);
            this.scratchCanvas.height = Math.max(this.scratchCanvas.height, requiredHeight);
        }
        const context = this.scratchContext;
        if (!context) {
            throw new Error('A 2D canvas context is required for SDF glyph atlas generation.');
        }
        return context;
    }

    private previewPack(width: number, height: number): PackPosition {
        if (width > this.size || height > this.size) {
            throw new Error(`SDF glyph cell ${width}x${height} exceeds atlas ${this.size}x${this.size}.`);
        }
        let x = this.packX;
        let y = this.packY;
        let rowHeight = this.packRowHeight;
        if (x + width > this.size) {
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }
        if (y + height > this.size) {
            throw new Error(`SDF glyph atlas ${this.size}x${this.size} is full.`);
        }
        return { x, y, rowHeight };
    }

    private commitPack(position: PackPosition, width: number, height: number): void {
        this.packX = position.x + width;
        this.packY = position.y;
        this.packRowHeight = Math.max(position.rowHeight, height);
    }
}

type MeasuredGlyph = {
    readonly hasInk: boolean;
    readonly width: number;
    readonly height: number;
    readonly bitmapWidth: number;
    readonly bitmapHeight: number;
    readonly xOffset: number;
    readonly yOffset: number;
    readonly xAdvance: number;
    readonly drawBaselineY: number;
};

type PackPosition = { readonly x: number; readonly y: number; readonly rowHeight: number };

function createScratchCanvas(width: number, height: number): ScratchCanvas {
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height) as ScratchCanvas;
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas as ScratchCanvas;
    }
    throw new Error(
        'SDF glyph generation requires Canvas2D through OffscreenCanvas or an HTML document. Importing the package is safe, but glyph generation is unavailable in this environment.',
    );
}

function requireCanvasContext(canvas: ScratchCanvas): ScratchContext {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        throw new Error('A 2D canvas context is required for SDF glyph atlas generation.');
    }
    return context;
}

function configureContext(context: ScratchContext, font: string): void {
    context.font = font;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
}

function validatePositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}

function validatePositiveNumber(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number.`);
    }
    return value;
}

function validateNonEmptyString(value: string, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${name} must be a non-empty string.`);
    }
    return value;
}

function validateCutoff(value: number): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('cutoff must be a finite number between 0 and 1.');
    }
    return value;
}
