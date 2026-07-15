import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'unit',
        environment: 'node',
        include: ['tests/unit/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/index.ts', 'src/types.ts'],
            reporter: ['text', 'html', 'lcov'],
            thresholds: {
                statements: 95,
                branches: 90,
                functions: 95,
                lines: 95,
            },
        },
    },
});
