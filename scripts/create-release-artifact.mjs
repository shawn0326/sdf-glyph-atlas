import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const outputDir = resolve(rootDir, 'release-artifacts');
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
if (packageJson.version === '0.0.0') {
    throw new Error('Refusing to create a release artifact for the placeholder version 0.0.0.');
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
    throw new Error('This artifact must be created through an npm script.');
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
    process.execPath,
    [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', outputDir],
    {
        cwd: rootDir,
        encoding: 'utf8',
    },
);
if (result.status !== 0) {
    throw new Error(`npm pack failed:\n${result.stderr || result.stdout}`);
}

const info = JSON.parse(result.stdout)[0];
if (!info?.filename) {
    throw new Error(`Unexpected npm pack output: ${result.stdout}`);
}
const filename = basename(info.filename);
const tarballPath = resolve(outputDir, filename);
const digest = createHash('sha256').update(readFileSync(tarballPath)).digest('hex');
writeFileSync(`${tarballPath}.sha256`, `${digest}  ${filename}\n`, 'utf8');

console.log(`Created ${tarballPath}`);
console.log(`SHA-256 ${digest}`);
