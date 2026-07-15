import { describe, expect, test } from 'vitest';

import { SdfTransform } from '../../src/sdf.js';

function rgbaFromAlpha(alpha: readonly number[]): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(alpha.length * 4);
    for (let i = 0; i < alpha.length; i++) {
        rgba[i * 4 + 3] = alpha[i] ?? 0;
    }
    return rgba;
}

describe('SdfTransform', () => {
    test('preserves transparent, opaque, and antialiased alpha values', () => {
        const transform = new SdfTransform();

        expect([...transform.transformRgba(rgbaFromAlpha([0, 0, 0, 0, 255, 0, 0, 0, 0]), 3, 3, 2, 0.25)]).toEqual([
            11, 64, 11, 64, 255, 64, 11, 64, 11,
        ]);
        expect([...transform.transformRgba(rgbaFromAlpha([0, 128, 255, 255, 128, 0]), 3, 2, 3, 0.5)]).toEqual([
            43, 128, 213, 213, 128, 43,
        ]);
    });

    test('remains stable while growing and reusing non-square workspaces', () => {
        const transform = new SdfTransform();
        const narrow = rgbaFromAlpha([0, 255, 0, 128, 255, 0, 64, 0]);
        const expectedNarrow = [64, 255, 64, 192, 255, 64, 160, 60];

        expect([...transform.transformRgba(narrow, 2, 4, 2, 0.25)]).toEqual(expectedNarrow);
        expect([
            ...transform.transformRgba(
                rgbaFromAlpha([0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 255, 255, 255, 0]),
                5,
                3,
                4,
                0.25,
            ),
        ]).toEqual([49, 101, 128, 101, 49, 101, 128, 191, 128, 101, 128, 255, 255, 255, 128]);
        expect([...transform.transformRgba(narrow, 2, 4, 2, 0.25)]).toEqual(expectedNarrow);
    });

    test('grows pixel and scanline capacities independently', () => {
        const transform = new SdfTransform();

        transform.transformRgba(rgbaFromAlpha([0, 255, 0]), 3, 1, 2, 0.25);
        expect([
            ...transform.transformRgba(
                rgbaFromAlpha([0, 0, 0, 0, 0, 128, 255, 0, 0, 255, 128, 0, 0, 0, 0, 0]),
                4,
                4,
                3,
                0.25,
            ),
        ]).toEqual([71, 106, 106, 71, 106, 191, 255, 106, 106, 255, 191, 106, 71, 106, 106, 71]);
        expect([...transform.transformRgba(rgbaFromAlpha([0, 128, 255, 128, 0]), 1, 5, 2, 0.25)]).toEqual([
            64, 192, 255, 192, 64,
        ]);
    });

    test('matches a naive signed-distance implementation for binary pixels', () => {
        const width = 4;
        const height = 3;
        const alpha = [0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255, 0];
        const radius = 4;
        const cutoff = 0.25;

        const actual = new SdfTransform().transformRgba(rgbaFromAlpha(alpha), width, height, radius, cutoff);
        expect([...actual]).toEqual(naiveBinarySdf(alpha, width, height, radius, cutoff));
    });
});

function naiveBinarySdf(
    alpha: readonly number[],
    width: number,
    height: number,
    radius: number,
    cutoff: number,
): number[] {
    const result: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inside = alpha[y * width + x] === 255;
            let nearestSquared = Number.POSITIVE_INFINITY;
            for (let otherY = 0; otherY < height; otherY++) {
                for (let otherX = 0; otherX < width; otherX++) {
                    const otherInside = alpha[otherY * width + otherX] === 255;
                    if (inside === otherInside) {
                        continue;
                    }
                    const dx = x - otherX;
                    const dy = y - otherY;
                    nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
                }
            }
            const distance = Math.sqrt(nearestSquared) * (inside ? -1 : 1);
            result.push(Math.max(0, Math.min(255, Math.round(255 - 255 * (distance / radius + cutoff)))));
        }
    }
    return result;
}
