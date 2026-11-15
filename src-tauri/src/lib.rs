pub mod anilist;
pub mod streams;

use tauri::Manager;

#[tauri::command]
async fn get_streams(
    anilist_id: u32,
    episode: u32,
    mal_id: Option<u32>,
) -> Result<streams::StreamData, String> {
    streams::fetch_streams_native(anilist_id, episode, mal_id).await
}

#[tauri::command]
async fn get_anilist_viewer(token: String) -> Result<anilist::AniListUser, String> {
    anilist::get_viewer(&token).await
}

#[tauri::command]
async fn sync_anilist_progress(
    token: String,
    media_id: u32,
    status: String,
    progress: u32,
) -> Result<anilist::SyncResult, String> {
    anilist::sync_media_progress(&token, media_id, &status, progress).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                // Set up deep link listener for animeshrik://auth/anilist/callback
                let handle = app.handle().clone();
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let _ = handle.emit("deep-link", url.to_string());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_streams,
            get_anilist_viewer,
            sync_anilist_progress
        ])
        .run(tauri::generate_context!())
        .expect("error while running AnimeShrik application");
}
