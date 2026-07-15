import { vi } from 'vitest';

export type Metric = {
    readonly width: number;
    readonly actualBoundingBoxAscent: number;
    readonly actualBoundingBoxDescent: number;
    readonly actualBoundingBoxLeft: number;
    readonly actualBoundingBoxRight: number;
};

type FakeCanvasOptions = {
    readonly metrics?: Readonly<Record<string, Metric>>;
    readonly onCreate?: (kind: 'html' | 'offscreen') => void;
    readonly throwOnRasterize?: ReadonlySet<string>;
    readonly contextAvailable?: boolean;
};

export function installHtmlCanvas(options: FakeCanvasOptions = {}): void {
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.stubGlobal('document', {
        createElement(tag: string) {
            if (tag !== 'canvas') {
                throw new Error(`Unexpected element: ${tag}`);
            }
            options.onCreate?.('html');
            return createFakeCanvas(1, 1, options);
        },
    });
}

export function installOffscreenCanvas(options: FakeCanvasOptions = {}, installDocument = false): void {
    class FakeOffscreenCanvas {
        width: number;
        height: number;
        private readonly canvas: ReturnType<typeof createFakeCanvas>;

        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
            this.canvas = createFakeCanvas(width, height, options);
            options.onCreate?.('offscreen');
        }

        getContext(contextId: string): unknown {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            return this.canvas.getContext(contextId);
        }
    }

    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    if (installDocument) {
        vi.stubGlobal('document', {
            createElement() {
                options.onCreate?.('html');
                return createFakeCanvas(1, 1, options);
            },
        });
    }
}

function createFakeCanvas(width: number, height: number, options: FakeCanvasOptions) {
    let lastRasterizedKey = '';
    const canvas = {
        width,
        height,
        getContext(contextId: string) {
            if (contextId !== '2d' || options.contextAvailable === false) {
                return null;
            }
            return {
                font: '',
                textBaseline: '',
                textAlign: '',
                fillStyle: '',
                clearRect() {},
                fillText(key: string) {
                    lastRasterizedKey = key;
                },
                measureText(key: string) {
                    return options.metrics?.[key] ?? defaultMetric(key);
                },
                getImageData(_x: number, _y: number, imageWidth: number, imageHeight: number) {
                    if (options.throwOnRasterize?.has(lastRasterizedKey)) {
                        throw new Error(`Rasterization failed for ${lastRasterizedKey}.`);
                    }
                    const data = new Uint8ClampedArray(imageWidth * imageHeight * 4);
                    const center = (Math.floor(imageHeight / 2) * imageWidth + Math.floor(imageWidth / 2)) * 4 + 3;
                    data[center] = 255;
                    return { width: imageWidth, height: imageHeight, data };
                },
            };
        },
    };
    return canvas;
}

function defaultMetric(key: string): Metric {
    const blank = key === ' ';
    return {
        width: blank ? 5 : 8,
        actualBoundingBoxAscent: blank ? 0 : 8,
        actualBoundingBoxDescent: blank ? 0 : 2,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: blank ? 0 : 8,
    };
}
