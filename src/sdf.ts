// The distance transform below is adapted from Mapbox TinySDF, which implements
// the Felzenszwalb/Huttenlocher Euclidean distance transform. See
// THIRD_PARTY_NOTICES.md for attribution and the BSD-2-Clause license text.

/** Default normalized cutoff used to encode a glyph edge. */
export const DEFAULT_SDF_CUTOFF = 0.25;

/**
 * Calculates padding that covers the complete SDF radius while retaining the
 * historical font-size heuristic used by the atlas.
 */
export function getSdfGlyphPadding(fontSize: number, sdfRadius = 0): number {
    return Math.max(Math.floor((fontSize / 24) * 3), Math.ceil(sdfRadius));
}

/** @internal */
export class SdfTransform {
    private gridOuter = new Float64Array(0);
    private gridInner = new Float64Array(0);
    private f = new Float64Array(0);
    private z = new Float64Array(0);
    private v = new Uint32Array(0);
    private readonly uint8Clamper = new Uint8ClampedArray(1);

    transformRgba(rgba: Uint8ClampedArray, width: number, height: number, radius: number, cutoff: number): Uint8Array {
        const pixelCount = width * height;
        this.ensureCapacity(pixelCount, Math.max(width, height));
        this.gridOuter.fill(INF, 0, pixelCount);
        this.gridInner.fill(0, 0, pixelCount);

        for (let i = 0; i < pixelCount; i++) {
            const alpha = (rgba[i * 4 + 3] ?? 0) / 255;
            if (alpha === 0) {
                continue;
            }
            if (alpha === 1) {
                this.gridOuter[i] = 0;
                this.gridInner[i] = INF;
            } else {
                const distance = 0.5 - alpha;
                this.gridOuter[i] = distance > 0 ? distance * distance : 0;
                this.gridInner[i] = distance < 0 ? distance * distance : 0;
            }
        }

        edt(this.gridOuter, width, height, this.f, this.v, this.z);
        edt(this.gridInner, width, height, this.f, this.v, this.z);

        const result = new Uint8Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            const distance = Math.sqrt(this.gridOuter[i] as number) - Math.sqrt(this.gridInner[i] as number);
            this.uint8Clamper[0] = Math.round(255 - 255 * (distance / radius + cutoff));
            result[i] = this.uint8Clamper[0] as number;
        }
        return result;
    }

    private ensureCapacity(pixelCount: number, gridSize: number): void {
        if (this.gridOuter.length < pixelCount) {
            this.gridOuter = new Float64Array(pixelCount);
            this.gridInner = new Float64Array(pixelCount);
        }
        if (this.f.length < gridSize) {
            this.f = new Float64Array(gridSize);
            this.z = new Float64Array(gridSize + 1);
            this.v = new Uint32Array(gridSize);
        }
    }
}

const INF = 1e20;

function edt(
    data: Float64Array,
    width: number,
    height: number,
    f: Float64Array,
    v: Uint32Array,
    z: Float64Array,
): void {
    for (let x = 0; x < width; x++) {
        edt1d(data, x, width, height, f, v, z);
    }
    for (let y = 0; y < height; y++) {
        edt1d(data, y * width, 1, width, f, v, z);
    }
}

function edt1d(
    grid: Float64Array,
    offset: number,
    stride: number,
    length: number,
    f: Float64Array,
    v: Uint32Array,
    z: Float64Array,
): void {
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    f[0] = grid[offset] as number;

    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride] as number;
        const q2 = q * q;
        do {
            const r = v[k] as number;
            s = ((f[q] as number) - (f[r] as number) + q2 - r * r) / (q - r) / 2;
        } while (s <= (z[k] as number) && --k > -1);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }

    for (let q = 0, k = 0; q < length; q++) {
        while ((z[k + 1] as number) < q) {
            k++;
        }
        const r = v[k] as number;
        const distance = q - r;
        grid[offset + q * stride] = (f[r] as number) + distance * distance;
    }
}
