import vercelAdapter from '@sveltejs/adapter-vercel';
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_BUILD);

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: isTauri
            ? staticAdapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: false })
            : vercelAdapter({ runtime: 'nodejs22.x' }),
        experimental: {
            handleRenderingErrors: true
        }
    }
};

export default config;