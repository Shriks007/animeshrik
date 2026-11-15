pub mod anilist;
pub mod streams;

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

#[tauri::command]
async fn exchange_anilist_code(code: String) -> Result<String, String> {
    anilist::exchange_auth_code(&code).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_streams,
            get_anilist_viewer,
            sync_anilist_progress,
            exchange_anilist_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running AnimeShrik application");
}
