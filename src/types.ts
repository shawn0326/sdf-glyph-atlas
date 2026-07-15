/** Options used to construct a fixed-size SDF glyph atlas. */
export interface SdfGlyphAtlasOptions {
    /** Width and height of the square atlas, in pixels. */
    readonly size: number;
    /** CSS Canvas2D font shorthand used for measurement and rasterization. */
    readonly font: string;
    /** Font size in CSS pixels, used to derive safe glyph padding. */
    readonly fontSize: number;
    /** Signed-distance radius encoded around each glyph edge, in pixels. */
    readonly sdfRadius: number;
    /** Portion of the encoded radius reserved inside the edge. Defaults to `0.25`. */
    readonly cutoff?: number;
    /** Maximum number of cached glyphs. Defaults to no explicit count limit. */
    readonly maxGlyphs?: number;
}

/**
 * A cached glyph cell and its single-channel SDF pixels.
 *
 * Coordinates use a top-left origin. Pixel data is row-major and has exactly
 * `width * height` entries. Consumers must not mutate `pixels`.
 */
export interface SdfGlyph {
    /** Caller-provided cache key. It may contain one or more Unicode code points. */
    readonly key: string;
    /** Stable zero-based insertion index. */
    readonly index: number;
    /** Atlas-space cell x coordinate, in pixels. */
    readonly x: number;
    /** Atlas-space cell y coordinate, in pixels. */
    readonly y: number;
    /** Padded cell width, in pixels. */
    readonly width: number;
    /** Padded cell height, in pixels. */
    readonly height: number;
    /** Ink rectangle x coordinate relative to the cell. */
    readonly bitmapX: number;
    /** Ink rectangle y coordinate relative to the cell. */
    readonly bitmapY: number;
    /** Measured ink width, in pixels. */
    readonly bitmapWidth: number;
    /** Measured ink height, in pixels. */
    readonly bitmapHeight: number;
    /** Horizontal offset from the layout pen to the top-left ink origin. */
    readonly xOffset: number;
    /** Vertical offset from the alphabetic baseline to the top-left ink origin. */
    readonly yOffset: number;
    /** Canvas2D layout advance, in pixels. */
    readonly xAdvance: number;
    /** Read-only-by-contract single-channel SDF cell pixels. */
    readonly pixels: Readonly<Uint8Array>;
}

/** Result of requesting one glyph. */
export interface SdfGlyphAtlasResult {
    /** The existing or newly created glyph. */
    readonly glyph: SdfGlyph;
    /** Whether this request inserted the glyph. */
    readonly created: boolean;
}

/** Result of a transactional batch request. */
export interface SdfGlyphBatchResult {
    /** Glyphs corresponding one-for-one with the input order. */
    readonly glyphs: readonly SdfGlyph[];
    /** Glyphs newly inserted by this call, in creation order. */
    readonly created: readonly SdfGlyph[];
}
