import { expect, test } from 'vitest';

import { SdfGlyphAtlas } from '../../src/index.js';

test('generates stable glyph metadata and non-empty SDF pixels with a real Canvas2D implementation', () => {
    const atlas = new SdfGlyphAtlas({
        size: 256,
        font: '600 32px sans-serif',
        fontSize: 32,
        sdfRadius: 8,
    });

    const first = atlas.getOrCreateGlyph('A');
    const repeated = atlas.getOrCreateGlyph('A');
    const blank = atlas.getOrCreateGlyph(' ').glyph;

    expect(first.created).toBe(true);
    expect(repeated.created).toBe(false);
    expect(repeated.glyph).toBe(first.glyph);
    expect(first.glyph.xAdvance).toBeGreaterThan(0);
    expect(first.glyph.bitmapWidth).toBeGreaterThan(0);
    expect(first.glyph.bitmapHeight).toBeGreaterThan(0);
    expect(first.glyph.pixels).toHaveLength(first.glyph.width * first.glyph.height);
    expect(Array.from(first.glyph.pixels).some((value) => value > 0)).toBe(true);
    expect(blank.bitmapWidth).toBe(0);
    expect(blank.bitmapHeight).toBe(0);
    expect(atlas.glyphCount).toBe(2);
});

test.skipIf(!navigator.userAgent.includes('Chrome'))(
    'generates glyphs inside a Chromium dedicated worker through OffscreenCanvas',
    async () => {
        expect(typeof OffscreenCanvas).toBe('function');

        const worker = new Worker(new URL('./fixtures/atlas.worker.ts', import.meta.url), { type: 'module' });
        try {
            const result = await new Promise<WorkerResult>((resolve, reject) => {
                worker.addEventListener('message', (event: MessageEvent<WorkerResult>) => resolve(event.data), {
                    once: true,
                });
                worker.addEventListener('error', (event) => reject(event.error ?? new Error(event.message)), {
                    once: true,
                });
                worker.postMessage('Worker');
            });

            expect(result).toMatchObject({
                keys: ['W', 'o', 'r', 'k', 'e', 'r'],
                createdKeys: ['W', 'o', 'r', 'k', 'e'],
                glyphCount: 5,
                hasPixels: true,
            });
        } finally {
            worker.terminate();
        }
    },
);

type WorkerResult = {
    readonly keys: readonly string[];
    readonly createdKeys: readonly string[];
    readonly glyphCount: number;
    readonly hasPixels: boolean;
};
