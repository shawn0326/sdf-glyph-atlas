import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const expectedTag = `v${packageJson.version}`;

if (packageJson.version === '0.0.0') {
    throw new Error('Version 0.0.0 is a development placeholder and cannot be published.');
}

const status = git(['status', '--porcelain', '--untracked-files=normal']);
if (status.length > 0) {
    throw new Error(`The working tree must be clean before publishing:\n${status}`);
}

const currentTag = git(['describe', '--tags', '--exact-match', 'HEAD']);
if (currentTag !== expectedTag) {
    throw new Error(`HEAD must be tagged ${expectedTag}; found ${currentTag || 'no exact tag'}.`);
}

console.log(`Release source verified for ${packageJson.name}@${packageJson.version}.`);

function git(args) {
    const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
    if (result.status !== 0 && args[0] !== 'describe') {
        throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
    }
    return result.stdout.trim();
}
