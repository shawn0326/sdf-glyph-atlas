# sdf-glyph-atlas

[![CI](https://github.com/shawn0326/sdf-glyph-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/shawn0326/sdf-glyph-atlas/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sdf-glyph-atlas.svg)](https://www.npmjs.com/package/sdf-glyph-atlas)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Renderer-independent, CPU-side signed-distance-field glyph atlas generation for modern browsers and workers.

[简体中文](README.zh-CN.md)

## Why

`sdf-glyph-atlas` handles the small but fiddly CPU-side portion of SDF text rendering:

- measure and rasterize glyphs with Canvas2D;
- generate single-channel signed-distance-field pixels;
- pack glyph cells into a fixed-size atlas;
- cache metrics and pixels under stable numeric indices; and
- report newly created glyphs for incremental renderer uploads.

It has no runtime dependencies and does not depend on WebGL, WebGPU, a frame graph, or a particular renderer.

## Install

```sh
npm install sdf-glyph-atlas
```

The package is ESM-only.

## Quick start

```ts
import { SdfGlyphAtlas } from 'sdf-glyph-atlas';

const atlas = new SdfGlyphAtlas({
    size: 2048,
    font: '600 48px system-ui, sans-serif',
    fontSize: 48,
    sdfRadius: 16,
    maxGlyphs: 4096,
});

const { glyphs, created } = atlas.getOrCreateGlyphs('Hello');

for (const glyph of created) {
    // Upload this row-major, single-channel patch at (glyph.x, glyph.y).
    renderer.writeGlyphPatch({
        x: glyph.x,
        y: glyph.y,
        width: glyph.width,
        height: glyph.height,
        pixels: glyph.pixels,
    });
}
```

`glyphs` preserves input order, including repeated keys. `created` contains each glyph inserted by that call once. Batch creation is transactional: if measuring, rasterizing, or packing any key fails, every glyph created by that call is rolled back.

Use `atlas.glyphs()` to rebuild a complete renderer-owned texture after a device or context reset.

## API

### `new SdfGlyphAtlas(options)`

| Option | Type | Description |
| --- | --- | --- |
| `size` | `number` | Width and height of the square atlas in pixels; must be a positive integer. |
| `font` | `string` | Non-empty CSS Canvas2D font shorthand. |
| `fontSize` | `number` | Positive CSS-pixel font size used to calculate padding. Keep it consistent with `font`. |
| `sdfRadius` | `number` | Positive signed-distance radius in pixels. |
| `cutoff` | `number` | Optional normalized inside-edge cutoff in `[0, 1]`; defaults to `0.25`. |
| `maxGlyphs` | `number` | Optional positive integer count limit; defaults to no explicit count limit. |

Public members:

- `glyphCount`: number of cached glyphs;
- `getGlyph(key)`: lookup by cache key;
- `getGlyphByIndex(index)`: lookup by stable insertion index;
- `glyphs()`: snapshot of all glyphs in index order;
- `getOrCreateGlyph(key)`: resolve one glyph and report whether it was created; and
- `getOrCreateGlyphs(keys)`: transactionally resolve an iterable of keys.

The root entry also exports `DEFAULT_SDF_CUTOFF`, `getSdfGlyphPadding`, and the `SdfGlyph`, `SdfGlyphAtlasOptions`, `SdfGlyphAtlasResult`, and `SdfGlyphBatchResult` types. Deep imports are intentionally unsupported.

### Glyph data

Each `SdfGlyph` contains:

- its cache `key` and stable `index`;
- the padded atlas cell (`x`, `y`, `width`, `height`);
- the ink rectangle within that cell (`bitmapX`, `bitmapY`, `bitmapWidth`, `bitmapHeight`);
- layout metrics (`xOffset`, `yOffset`, `xAdvance`); and
- row-major `pixels` with exactly `width * height` unsigned bytes.

Glyph metadata is frozen. Pixel arrays are cached and exposed without copying for performance; treat them as read-only.

## Coordinates and SDF convention

Atlas and cell coordinates use a top-left origin. `xOffset` and `yOffset` locate the top-left ink origin relative to the layout pen and alphabetic baseline. At the glyph edge the normalized SDF value is `1 - cutoff`; with the default cutoff this is `0.75`.

The package does not prescribe texture formats or UV conventions. A renderer may upload the bytes to a single-channel texture or expand them into another format.

## Browsers, workers, and fonts

Canvas allocation is lazy. The package prefers `OffscreenCanvas` and falls back to an HTML canvas when a document is available. It can therefore generate glyphs in browser main threads and in workers that expose an OffscreenCanvas 2D context.

Importing the package is safe in Node.js and SSR environments, but calling a glyph-generation method there throws a clear error unless a native Canvas API is provided globally. Node.js rendering is not a supported target.

Load fonts before requesting the first glyph. Cached glyphs are not invalidated when font availability changes:

```ts
await document.fonts.load('600 48px "Inter"');

const atlas = new SdfGlyphAtlas({
    size: 1024,
    font: '600 48px "Inter"',
    fontSize: 48,
    sdfRadius: 12,
});
```

A worker can import and use the package directly when OffscreenCanvas is supported:

```ts
import { SdfGlyphAtlas } from 'sdf-glyph-atlas';

const atlas = new SdfGlyphAtlas({
    size: 1024,
    font: '32px sans-serif',
    fontSize: 32,
    sdfRadius: 8,
});

self.onmessage = ({ data }: MessageEvent<string>) => {
    self.postMessage(atlas.getOrCreateGlyphs(data));
};
```

## Unicode and scope

Keys are arbitrary non-empty strings. Iterating a JavaScript string, as in `getOrCreateGlyphs(text)`, splits it by Unicode code point rather than UTF-16 code unit. This still does not perform grapheme segmentation, shaping, ligature selection, bidirectional ordering, fallback-face reporting, line breaking, alignment, or kerning beyond what Canvas2D applies while rasterizing an individual key. Applications that require those features must shape text first and use the resulting runs as cache keys.

An atlas is fixed-size and insertion-only. It does not resize, repack, remove, or evict glyphs; capacity overflow throws without partially committing the failed request.

## Development

Node.js 24 and npm 11 are used by CI.

```sh
npm install
npx playwright install chromium
npm run format
npm run typecheck
npm run test:coverage
npm run test:browser
npm run check
```

The default browser test and `npm run check` use Chromium for a fast local feedback loop. CI and releases run `npm run check:ci`, which requires Playwright's Chromium, Firefox, and WebKit binaries and executes the complete browser matrix. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and release conventions.

## License

The project is licensed under the [MIT License](LICENSE). The distance-transform implementation is adapted from Mapbox TinySDF; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for its BSD-2-Clause notice.
