use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

const ANILIST_GRAPHQL: &str = "https://graphql.anilist.co";

#[derive(Debug, Serialize, Deserialize)]
pub struct AniListUser {
    pub id: u32,
    pub name: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
}

pub async fn get_viewer(token: &str) -> Result<AniListUser, String> {
    let client = reqwest::Client::new();
    let query = r#"
        query {
            Viewer {
                id
                name
                avatar {
                    medium
                    large
                }
            }
        }
    "#;

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token)).map_err(|e| e.to_string())?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let body = serde_json::json!({ "query": query });
    let resp = client
        .post(ANILIST_GRAPHQL)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let viewer = json["data"]["Viewer"]
        .as_object()
        .ok_or("Invalid response from AniList")?;

    let id = viewer["id"].as_u64().unwrap_or(0) as u32;
    let name = viewer["name"].as_str().unwrap_or("User").to_string();
    let avatar = viewer["avatar"]["large"]
        .as_str()
        .or_else(|| viewer["avatar"]["medium"].as_str())
        .map(|s| s.to_string());

    Ok(AniListUser { id, name, avatar })
}

pub async fn sync_media_progress(
    token: &str,
    media_id: u32,
    status: &str,
    progress: u32,
) -> Result<SyncResult, String> {
    let client = reqwest::Client::new();
    let mutation = r#"
        mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
            SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: $progress) {
                id
                status
                progress
            }
        }
    "#;

    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token)).map_err(|e| e.to_string())?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    let body = serde_json::json!({
        "query": mutation,
        "variables": {
            "mediaId": media_id,
            "status": status,
            "progress": progress
        }
    });

    let resp = client
        .post(ANILIST_GRAPHQL)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if resp.status().is_success() {
        Ok(SyncResult {
            success: true,
            message: "Progress updated on AniList".to_string(),
        })
    } else {
        Err(format!("AniList returned HTTP {}", resp.status()))
    }
}

pub async fn exchange_auth_code(code: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", "57081"),
        ("client_secret", "394ps9UhZgGIIrtex7e8tfWBNNBgWJ0sPv5rmoy1"),
        ("redirect_uri", "https://anilist.co/api/v2/oauth/pin"),
        ("code", code),
    ];
    let resp = client
        .post("https://anilist.co/api/v2/oauth/token")
        .form(&params)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(token) = json["access_token"].as_str() {
        Ok(token.to_string())
    } else {
        let err = json["error_description"]
            .as_str()
            .or_else(|| json["message"].as_str())
            .unwrap_or("Failed to exchange code for token");
        Err(err.to_string())
    }
}

