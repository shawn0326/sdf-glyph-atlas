import { SdfGlyphAtlas } from '../../../src/index.js';

const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<string>) => void) | null;
    postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
    const atlas = new SdfGlyphAtlas({
        size: 256,
        font: '24px sans-serif',
        fontSize: 24,
        sdfRadius: 6,
    });
    const result = atlas.getOrCreateGlyphs(event.data);
    scope.postMessage({
        keys: result.glyphs.map((glyph) => glyph.key),
        createdKeys: result.created.map((glyph) => glyph.key),
        glyphCount: atlas.glyphCount,
        hasPixels: result.glyphs.every((glyph) => glyph.pixels.length === glyph.width * glyph.height),
    });
};
