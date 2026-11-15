# AnimeShrik Android App (Rust + Tauri Mobile)

AnimeShrik is a native Android anime streaming app built with **Tauri Mobile (Rust)** and a **SvelteKit** web frontend.

---

## 🏗️ Architecture

- **Native Rust Layer (`src-tauri`)**:
  - Direct HTTP scraping via `https://api.anikage.workers.dev` to bypass browser CORS limitations.
  - **Zoko URL Rewriting**: Automatically retrieves the anime's real `idMal` from AniList, rewrites Zoko streams to `https://zokoanime.video/stream/mal/{realMalId}/{episode}/{sub|dub}`, and drops invalid Zoko entries if no MAL ID exists.
  - 60-minute in-memory stream caching with automatic 3-attempt retries.
  - Native deep-link handler for `animeshrik://auth/anilist/callback`.
- **Frontend Layer (`src/`)**:
  - Full AnimeShrik UI with pure black background (`#000000`), `#232323` surfaces, and `#ff6800` orange accents.
  - **Primary Mobile Navigation**: Persistent bottom navigation bar with 5 primary tabs:
    1. **Home** (`/home`)
    2. **Search** (`/search`)
    3. **Schedule** (`/schedule`)
    4. **Watchlist** (`/watchlist`)
    5. **Settings** (`/settings`)
  - **Header (Top bar)**: Wordmark logo, search trigger, notifications bell with unread badge, appearance, and profile/AniList sign-in.
  - **Player**: Embedded video stream player with intro/outro skip times, next-episode navigation, server rotation on failure, and automatic watched status at 75% completion.
  - **Themes**: 20 dark and light themes (Lantern Glow default, Lime Green, Midnight Purple, Cyberpunk Neon, etc.).

---

## 🔐 AniList OAuth Setup

- **Client ID**: `56322`
- **Application Name**: AnimeShrik
- **Mobile Redirect URI**: `animeshrik://auth/anilist/callback`
- **Security**: The app uses PKCE / client token grant without any client secrets bundled in the client code.

To add this in AniList:
1. Go to [AniList Developer Settings](https://anilist.co/settings/developer).
2. Edit the **AnimeShrik** client (ID: `56322`).
3. Add `animeshrik://auth/anilist/callback` to the **Redirect URLs**.

---

## 🚀 How to Build the APK

### Method 1: Automated GitHub Actions CI (Recommended)

1. Push your commits to GitHub:
   ```bash
   git add .
   git commit -m "feat: Tauri Android Rust app"
   git push origin main
   ```
2. Navigate to your repository's **Actions** tab on GitHub.
3. The workflow **"Build AnimeShrik Android APK"** will execute on an Ubuntu runner with full Android SDK (API 34), NDK r26, and Rust Android toolchain (`aarch64-linux-android`).
4. Download the generated APK artifact (`AnimeShrik-Android-APK`) and install it directly on your Nothing Phone 4A 5G.

### Method 2: Local Build (Linux x86_64 / macOS / WSL2)

Prerequisites:
- Android Studio / Android SDK (Platform 34, Build Tools 34.0.0, NDK r26)
- Java 17 (JDK)
- Rust (`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`)
- `pnpm` & Node.js 20+

Commands:
```bash
# 1. Install dependencies
pnpm install
pnpm approve-builds --all

# 2. Build frontend
pnpm run build

# 3. Build Android APK
pnpm dlx @tauri-apps/cli android build --apk --debug --target aarch64
```
The APK will be generated under `src-tauri/gen/android/app/build/outputs/apk/universal/debug/` or `.../arm64-v8a/debug/`.

---

## ✅ Verified Features

- **Home Page**: Loaded and tested with active AniList trending and schedule rails.
- **Search**: Interactive modal and catalogue grid.
- **Zoko Stream Rewriting**: Verified for Tokyo Ghoul Episode 1 (AniList ID: `20605`, MAL ID: `22319`). The stream resolved to `https://zokoanime.video/stream/mal/22319/1/sub` and successfully played via HLS with quality level selection.
- **MyAnimeList Modal**: "Under construction" humorous popup with "Sign in with AniList instead" and "Carry on as a guest".
