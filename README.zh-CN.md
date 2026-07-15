# sdf-glyph-atlas

[![CI](https://github.com/shawn0326/sdf-glyph-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/shawn0326/sdf-glyph-atlas/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sdf-glyph-atlas.svg)](https://www.npmjs.com/package/sdf-glyph-atlas)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

面向现代浏览器和 Worker、与渲染器无关的 CPU 端有符号距离场字形图集生成库。

[English](README.md)

## 为什么使用

`sdf-glyph-atlas` 负责 SDF 文本渲染中细小但容易出错的 CPU 端工作：

- 使用 Canvas2D 测量并栅格化字形；
- 生成单通道有符号距离场像素；
- 将字形单元打包到固定大小的图集中；
- 使用稳定的数字索引缓存指标和像素；
- 报告新建字形，供渲染器增量上传。

它没有运行时依赖，也不依赖 WebGL、WebGPU、FrameGraph 或特定渲染器。

## 安装

```sh
npm install sdf-glyph-atlas
```

本包仅提供 ESM。

## 快速开始

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
    // 将这个行优先、单通道的像素块上传到 (glyph.x, glyph.y)。
    renderer.writeGlyphPatch({
        x: glyph.x,
        y: glyph.y,
        width: glyph.width,
        height: glyph.height,
        pixels: glyph.pixels,
    });
}
```

`glyphs` 保持输入顺序，包括重复 key；`created` 只包含本次调用实际插入的字形。批量创建具有事务性：任意 key 的测量、栅格化或打包失败时，本次调用创建的所有字形都会回滚。

设备或上下文重建后，可用 `atlas.glyphs()` 重建渲染器持有的完整纹理。

## API

### `new SdfGlyphAtlas(options)`

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `size` | `number` | 正方形图集的宽高像素值，必须是正整数。 |
| `font` | `string` | 非空的 CSS Canvas2D font 简写。 |
| `fontSize` | `number` | 用于计算留白的正数 CSS 像素字号，应与 `font` 保持一致。 |
| `sdfRadius` | `number` | 正数的有符号距离半径，单位为像素。 |
| `cutoff` | `number` | 可选的内部边缘归一化截点，范围 `[0, 1]`，默认 `0.25`。 |
| `maxGlyphs` | `number` | 可选的正整数字形数量上限，默认不设置显式数量限制。 |

公开成员：

- `glyphCount`：已缓存字形数量；
- `getGlyph(key)`：按缓存 key 查询；
- `getGlyphByIndex(index)`：按稳定插入索引查询；
- `glyphs()`：按索引顺序返回全部字形的快照；
- `getOrCreateGlyph(key)`：取得单个字形并报告是否新建；
- `getOrCreateGlyphs(keys)`：以事务方式处理 key 迭代器。

根入口还导出 `DEFAULT_SDF_CUTOFF`、`getSdfGlyphPadding` 以及 `SdfGlyph`、`SdfGlyphAtlasOptions`、`SdfGlyphAtlasResult`、`SdfGlyphBatchResult` 类型。不支持深层路径导入。

### 字形数据

每个 `SdfGlyph` 包含：

- 缓存 `key` 和稳定 `index`；
- 图集中的带留白单元格（`x`、`y`、`width`、`height`）；
- 单元格内的墨迹矩形（`bitmapX`、`bitmapY`、`bitmapWidth`、`bitmapHeight`）；
- 排版指标（`xOffset`、`yOffset`、`xAdvance`）；
- 恰好包含 `width * height` 个无符号字节的行优先 `pixels`。

字形元数据会被冻结。为避免复制开销，像素数组直接暴露缓存内容，调用方必须把它视为只读数据。

## 坐标与 SDF 约定

图集和单元格坐标采用左上角原点。`xOffset`、`yOffset` 表示墨迹左上角相对于排版笔位置和字母基线的偏移。字形边缘处的归一化 SDF 值为 `1 - cutoff`，默认值为 `0.75`。

本包不规定纹理格式或 UV 方向。渲染器可以把字节上传到单通道纹理，也可以扩展为其他格式。

## 浏览器、Worker 与字体

Canvas 会延迟创建。本包优先使用 `OffscreenCanvas`，在存在 document 时回退到 HTML canvas，因此既可在浏览器主线程运行，也可在提供 OffscreenCanvas 2D Context 的 Worker 中运行。

在 Node.js 和 SSR 环境中导入本包是安全的，但如果宿主没有提供原生 Canvas API，调用字形生成方法会抛出明确错误。Node.js 字形渲染不在支持范围内。

第一次请求字形前应先加载字体。字体可用性变化不会使已有缓存失效：

```ts
await document.fonts.load('600 48px "Inter"');

const atlas = new SdfGlyphAtlas({
    size: 1024,
    font: '600 48px "Inter"',
    fontSize: 48,
    sdfRadius: 12,
});
```

支持 OffscreenCanvas 时，Worker 可以直接导入并使用本包：

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

## Unicode 与功能边界

key 可以是任意非空字符串。像 `getOrCreateGlyphs(text)` 这样迭代 JavaScript 字符串时，会按 Unicode code point 而不是 UTF-16 code unit 拆分；但这仍不负责字素簇分割、文本 shaping、连字选择、双向排序、回退字体报告、换行、对齐，以及单 key 栅格化之外的字距处理。需要这些能力的应用应先完成 shaping，再将结果 run 作为缓存 key。

图集大小固定且只允许插入。它不会扩容、重新打包、删除或淘汰字形；容量溢出时会抛错且不会部分提交失败请求。

## 开发

CI 使用 Node.js 24 和 npm 11。

```sh
npm install
npx playwright install chromium
npm run format
npm run typecheck
npm run test:coverage
npm run test:browser
npm run check
```

默认浏览器测试和 `npm run check` 只使用 Chromium，以提供更快的本地反馈。CI 与 Release 使用 `npm run check:ci`，需要安装 Playwright 的 Chromium、Firefox 和 WebKit，并执行完整浏览器矩阵。环境配置与发布约定见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。

## 许可证

项目采用 [MIT License](LICENSE)。距离变换实现改编自 Mapbox TinySDF，其 BSD-2-Clause 声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
