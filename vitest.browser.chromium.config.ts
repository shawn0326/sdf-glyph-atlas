import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'browser-chromium',
        include: ['tests/browser/**/*.test.ts'],
        browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium' } }),
            instances: [{ browser: 'chromium' }],
        },
    },
});
