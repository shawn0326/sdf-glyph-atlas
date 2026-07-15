import { afterEach, describe, expect, test, vi } from 'vitest';

import { DEFAULT_SDF_CUTOFF, getSdfGlyphPadding, SdfGlyphAtlas } from '../../src/index.js';
import { installHtmlCanvas, installOffscreenCanvas, type Metric } from './fakeCanvas.js';

function createAtlas(options: Partial<ConstructorParameters<typeof SdfGlyphAtlas>[0]> = {}): SdfGlyphAtlas {
    return new SdfGlyphAtlas({
        size: 128,
        font: '600 48px system-ui',
        fontSize: 48,
        sdfRadius: 12,
        ...options,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('SdfGlyphAtlas', () => {
    test('calculates padding and exposes the default cutoff', () => {
        expect(getSdfGlyphPadding(72, 24)).toBe(24);
        expect(getSdfGlyphPadding(72, 2)).toBe(9);
        expect(getSdfGlyphPadding(48, 7.2)).toBe(8);
        expect(getSdfGlyphPadding(24)).toBe(3);
        expect(DEFAULT_SDF_CUTOFF).toBe(0.25);
    });

    test('caches glyph metrics, pixels, and stable indices', () => {
        installHtmlCanvas({
            metrics: {
                T: metric({ width: 14, ascent: 11, descent: 4, left: 3, right: 9 }),
            },
        });
        const atlas = createAtlas();
        const first = atlas.getOrCreateGlyph('T');
        const repeated = atlas.getOrCreateGlyph('T');

        expect(first.created).toBe(true);
        expect(repeated.created).toBe(false);
        expect(repeated.glyph).toBe(first.glyph);
        expect(Object.isFrozen(first.glyph)).toBe(true);
        expect(first.glyph).toMatchObject({
            index: 0,
            xAdvance: 14,
            xOffset: -3,
            yOffset: -11,
            bitmapWidth: 12,
            bitmapHeight: 15,
        });
        expect(first.glyph.pixels).toHaveLength(first.glyph.width * first.glyph.height);
        const center = Math.floor(first.glyph.height / 2) * first.glyph.width + Math.floor(first.glyph.width / 2);
        expect(first.glyph.pixels[center]).toBe(213);
        expect(atlas.getGlyph('T')).toBe(first.glyph);
        expect(atlas.getGlyphByIndex(0)).toBe(first.glyph);
        expect(atlas.getGlyphByIndex(1)).toBeUndefined();
    });

    test('returns isolated snapshots in stable insertion order', () => {
        installHtmlCanvas();
        const atlas = createAtlas();
        atlas.getOrCreateGlyphs('abc');
        const first = atlas.glyphs();
        (first as unknown as unknown[]).pop();

        expect(atlas.glyphs().map((glyph) => glyph.key)).toEqual(['a', 'b', 'c']);
        expect(atlas.glyphCount).toBe(3);
    });

    test('preserves input order, Unicode code points, and reports each new key once', () => {
        installHtmlCanvas();
        const atlas = createAtlas();
        const result = atlas.getOrCreateGlyphs('a😀a');

        expect(result.glyphs.map((glyph) => glyph.key)).toEqual(['a', '😀', 'a']);
        expect(result.created.map((glyph) => glyph.key)).toEqual(['a', '😀']);
        expect(atlas.glyphCount).toBe(2);
    });

    test('reuses one scratch HTML canvas for measurement and rasterization', () => {
        let canvasCreateCount = 0;
        installHtmlCanvas({ onCreate: () => canvasCreateCount++ });
        const atlas = createAtlas();
        atlas.getOrCreateGlyphs('abc');
        atlas.getOrCreateGlyph('d');

        expect(canvasCreateCount).toBe(1);
    });

    test('prefers OffscreenCanvas without touching the document', () => {
        const created: string[] = [];
        installOffscreenCanvas({ onCreate: (kind) => created.push(kind) }, true);
        createAtlas().getOrCreateGlyph('a');

        expect(created).toEqual(['offscreen']);
    });

    test('reports unavailable Canvas2D environments clearly and remains empty', () => {
        vi.stubGlobal('OffscreenCanvas', undefined);
        vi.stubGlobal('document', undefined);
        const atlas = createAtlas();

        expect(() => atlas.getOrCreateGlyph('a')).toThrow(
            /requires Canvas2D through OffscreenCanvas or an HTML document/,
        );
        expect(atlas.glyphCount).toBe(0);
    });

    test('reports an unavailable 2D context clearly', () => {
        installHtmlCanvas({ contextAvailable: false });
        const atlas = createAtlas();

        expect(() => atlas.getOrCreateGlyph('a')).toThrow(/2D canvas context is required/);
        expect(atlas.glyphCount).toBe(0);
    });

    test('retains blank advance without allocating padded ink', () => {
        installHtmlCanvas({ metrics: { ' ': metric({ width: 5, right: 9 }) } });
        const glyph = createAtlas().getOrCreateGlyph(' ').glyph;

        expect(glyph).toMatchObject({
            xAdvance: 5,
            bitmapX: 0,
            bitmapY: 0,
            bitmapWidth: 0,
            bitmapHeight: 0,
            width: 4,
            height: 4,
        });
        expect([...glyph.pixels]).toEqual(new Array(16).fill(0));
    });

    test('starts a new shelf row and rejects overflow without committing a glyph', () => {
        installHtmlCanvas({ metrics: equalMetrics(['a', 'b', 'c'], 14) });
        const atlas = createAtlas({ size: 25, fontSize: 8, sdfRadius: 1 });
        const first = atlas.getOrCreateGlyph('a').glyph;
        const second = atlas.getOrCreateGlyph('b').glyph;

        expect(first.x).toBe(0);
        expect(second.x).toBe(0);
        expect(second.y).toBeGreaterThan(first.y);
        expect(() => atlas.getOrCreateGlyph('c')).toThrow(/atlas 25x25 is full/);
        expect(atlas.glyphCount).toBe(2);
        expect(atlas.getGlyph('c')).toBeUndefined();
    });

    test('rejects a single oversized glyph cell without committing it', () => {
        installHtmlCanvas({ metrics: { W: metric({ width: 20, right: 20 }) } });
        const atlas = createAtlas({ size: 16, fontSize: 8, sdfRadius: 1 });

        expect(() => atlas.getOrCreateGlyph('W')).toThrow(/glyph cell \d+x\d+ exceeds atlas 16x16/);
        expect(atlas.glyphCount).toBe(0);
        expect(atlas.getGlyph('W')).toBeUndefined();
    });

    test('rolls back new glyphs and packing when batch capacity overflows', () => {
        installHtmlCanvas({ metrics: equalMetrics(['x', 'a', 'b', 'c', 'd'], 8) });
        const atlas = createAtlas({ size: 25, fontSize: 8, sdfRadius: 1 });
        const existing = atlas.getOrCreateGlyph('x').glyph;

        expect(() => atlas.getOrCreateGlyphs('abcd')).toThrow(/atlas 25x25 is full/);
        expect(atlas.glyphs()).toEqual([existing]);
        for (const key of 'abcd') {
            expect(atlas.getGlyph(key)).toBeUndefined();
        }

        const retried = atlas.getOrCreateGlyph('a').glyph;
        expect(retried.index).toBe(1);
        expect(retried.x).toBe(existing.width);
        expect(retried.y).toBe(0);
    });

    test('rolls back when an input iterable or rasterization throws', () => {
        installHtmlCanvas({ throwOnRasterize: new Set(['b']) });
        const atlas = createAtlas();
        expect(() => atlas.getOrCreateGlyphs('ab')).toThrow(/Rasterization failed for b/);
        expect(atlas.glyphCount).toBe(0);

        installHtmlCanvas();
        const secondAtlas = createAtlas();
        function* failingKeys(): Iterable<string> {
            yield 'a';
            throw new Error('Iterator failed.');
        }
        expect(() => secondAtlas.getOrCreateGlyphs(failingKeys())).toThrow(/Iterator failed/);
        expect(secondAtlas.glyphCount).toBe(0);
    });

    test('validates every option, key, and glyph capacity', () => {
        expect(() => createAtlas({ size: 0 })).toThrow(/size must be a positive integer/);
        expect(() => createAtlas({ size: 1.5 })).toThrow(/size must be a positive integer/);
        expect(() => createAtlas({ font: '' })).toThrow(/font must be a non-empty string/);
        expect(() => createAtlas({ fontSize: Number.NaN })).toThrow(/fontSize must be a positive number/);
        expect(() => createAtlas({ sdfRadius: 0 })).toThrow(/sdfRadius must be a positive number/);
        expect(() => createAtlas({ cutoff: -0.1 })).toThrow(/cutoff must be a finite number between 0 and 1/);
        expect(() => createAtlas({ cutoff: 1.1 })).toThrow(/cutoff must be a finite number between 0 and 1/);
        expect(() => createAtlas({ maxGlyphs: 0 })).toThrow(/maxGlyphs must be a positive integer/);

        installHtmlCanvas();
        const atlas = createAtlas({ maxGlyphs: 1, cutoff: 0 });
        atlas.getOrCreateGlyph('a');
        expect(() => atlas.getOrCreateGlyph('b')).toThrow(/glyph count exceeds maxGlyphs 1/);
        expect(() => atlas.getOrCreateGlyph('')).toThrow(/key must be a non-empty string/);
        expect(() => atlas.getOrCreateGlyph(42 as unknown as string)).toThrow(/key must be a non-empty string/);
    });
});

function metric(
    values: Partial<{
        width: number;
        ascent: number;
        descent: number;
        left: number;
        right: number;
    }> = {},
): Metric {
    return {
        width: values.width ?? 8,
        actualBoundingBoxAscent: values.ascent ?? 8,
        actualBoundingBoxDescent: values.descent ?? 2,
        actualBoundingBoxLeft: values.left ?? 0,
        actualBoundingBoxRight: values.right ?? values.width ?? 8,
    };
}

function equalMetrics(keys: readonly string[], width: number): Readonly<Record<string, Metric>> {
    return Object.fromEntries(keys.map((key) => [key, metric({ width, right: width })]));
}
