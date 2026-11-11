import { writable } from 'svelte/store';

/**
 * MyAnimeList sign-in is not built yet. When any "Sign in with MyAnimeList"
 * button is pressed, startMalLogin() flips this on instead of redirecting,
 * and the layout shows the humorous under-construction popup.
 */
export const malUnderConstruction = writable(false);

export function showMalUnderConstruction(): void {
	malUnderConstruction.set(true);
}

export function hideMalUnderConstruction(): void {
	malUnderConstruction.set(false);
}
