import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) {
    throw new Error('This check must be run through an npm script.');
}
const packResult = runNpm(['pack', '--json', '--dry-run', '--ignore-scripts'], rootDir);
const packInfo = parsePackOutput(packResult.stdout);
const files = packInfo.files.map((file) => file.path).sort();

const requiredFiles = [
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'THIRD_PARTY_NOTICES.md',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/index.js.map',
    'package.json',
];
for (const file of requiredFiles) {
    if (!files.includes(file)) {
        throw new Error(`Packed package is missing required file: ${file}`);
    }
}

const allowedRootFiles = new Set(['LICENSE', 'README.md', 'README.zh-CN.md', 'THIRD_PARTY_NOTICES.md', 'package.json']);
const unexpected = files.filter((file) => !file.startsWith('dist/') && !allowedRootFiles.has(file));
if (unexpected.length > 0) {
    throw new Error(`Packed package contains unexpected files:\n${unexpected.join('\n')}`);
}

const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
if (packInfo.name !== packageJson.name || packInfo.version !== packageJson.version) {
    throw new Error('Packed package name or version does not match package.json.');
}

const fixtureDir = mkdtempSync(join(tmpdir(), 'sdf-glyph-atlas-consumer-'));
try {
    const actualPack = parsePackOutput(
        runNpm(['pack', '--json', '--ignore-scripts', '--pack-destination', fixtureDir], rootDir).stdout,
    );
    const tarballPath = join(fixtureDir, basename(actualPack.filename));
    const consumerDir = join(fixtureDir, 'consumer');
    writeFileSync(
        join(fixtureDir, 'package.json'),
        `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
        'utf8',
    );
    runNpm(
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', consumerDir, tarballPath],
        fixtureDir,
    );

    writeFileSync(
        join(consumerDir, 'index.ts'),
        `import {\n` +
            `    DEFAULT_SDF_CUTOFF,\n` +
            `    SdfGlyphAtlas,\n` +
            `    getSdfGlyphPadding,\n` +
            `    type SdfGlyph,\n` +
            `    type SdfGlyphAtlasOptions,\n` +
            `    type SdfGlyphAtlasResult,\n` +
            `    type SdfGlyphBatchResult,\n` +
            `} from 'sdf-glyph-atlas';\n` +
            `const options: SdfGlyphAtlasOptions = { size: 64, font: '16px sans-serif', fontSize: 16, sdfRadius: 4 };\n` +
            `const atlas = new SdfGlyphAtlas(options);\n` +
            `const glyph: SdfGlyph | undefined = atlas.getGlyph('A');\n` +
            `const single: SdfGlyphAtlasResult | undefined = glyph ? { glyph, created: false } : undefined;\n` +
            `const batch: SdfGlyphBatchResult = { glyphs: [], created: [] };\n` +
            `void [atlas, single, batch, DEFAULT_SDF_CUTOFF, getSdfGlyphPadding(16, 4)];\n`,
        'utf8',
    );
    writeFileSync(
        join(consumerDir, 'tsconfig.json'),
        `${JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2020',
                    module: 'NodeNext',
                    moduleResolution: 'NodeNext',
                    strict: true,
                    noEmit: true,
                    skipLibCheck: false,
                },
                include: ['index.ts'],
            },
            null,
            2,
        )}\n`,
        'utf8',
    );

    run(process.execPath, [join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc')], consumerDir);
    run(
        process.execPath,
        [
            '--input-type=module',
            '--eval',
            "const api = await import('sdf-glyph-atlas'); if (typeof api.SdfGlyphAtlas !== 'function') process.exit(1);",
        ],
        consumerDir,
    );
} finally {
    rmSync(fixtureDir, { recursive: true, force: true });
}

console.log(`Validated ${packInfo.name}@${packInfo.version} (${files.length} packed files).`);

function parsePackOutput(output) {
    const parsed = JSON.parse(output);
    const info = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!info || !Array.isArray(info.files)) {
        throw new Error(`Unexpected npm pack output: ${output}`);
    }
    return info;
}

function runNpm(args, cwd) {
    return run(process.execPath, [npmCli, ...args], cwd);
}

function run(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(' ')} failed:\n${result.error?.message || result.stderr || result.stdout}`,
        );
    }
    return result;
}
