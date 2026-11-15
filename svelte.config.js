import vercelAdapter from '@sveltejs/adapter-vercel';
import autoAdapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_BUILD);

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: isTauri ? autoAdapter() : vercelAdapter({ runtime: 'nodejs22.x' }),
        experimental: {
            handleRenderingErrors: true
        }
    }
};

export default config;