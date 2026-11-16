import os
import glob

# 1. Patch AndroidManifest.xml for custom scheme intent filter
manifest_path = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'
if os.path.exists(manifest_path):
    with open(manifest_path, 'r', encoding='utf-8') as f:
        content = f.read()

    deep_link_filter = """
        <intent-filter>
          <action android:name="android.intent.action.VIEW" />
          <category android:name="android.intent.category.DEFAULT" />
          <category android:name="android.intent.category.BROWSABLE" />
          <data android:scheme="animeshrik" />
        </intent-filter>
    """

    if 'android:scheme="animeshrik"' not in content:
        content = content.replace('</activity>', deep_link_filter + '\n    </activity>')
        with open(manifest_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('[patch-android] Injected animeshrik scheme intent-filter into AndroidManifest.xml')
    else:
        print('[patch-android] animeshrik scheme intent-filter already in AndroidManifest.xml')
else:
    print('[patch-android] Warning: AndroidManifest.xml not found at', manifest_path)

# 2. Patch MainActivity.kt to intercept animeshrik:// and prevent ERR_UNKNOWN_URL_SCHEME
main_activities = glob.glob('src-tauri/gen/android/**/MainActivity.kt', recursive=True)
if main_activities:
    kt_path = main_activities[0]
    print('[patch-android] Found MainActivity at', kt_path)
    with open(kt_path, 'r', encoding='utf-8') as f:
        orig = f.read()

    pkg_line = 'package com.animeshrik.app'
    for line in orig.splitlines():
        if line.strip().startswith('package '):
            pkg_line = line.strip()
            break

    kt_code = f"""{pkg_line}

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest

class MainActivity : app.tauri.TauriActivity() {{
  override fun onWebViewCreate(webView: WebView) {{
    super.onWebViewCreate(webView)
    webView.webViewClient = object : WebViewClient() {{
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {{
        val url = request?.url?.toString() ?: return false
        return handleUrl(view, url)
      }}
      @Deprecated("Deprecated in Java")
      override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {{
        if (url == null) return false
        return handleUrl(view, url)
      }}
      private fun handleUrl(view: WebView?, url: String): Boolean {{
        if (url.startsWith("animeshrik://")) {{
          val pathAndQuery = url.removePrefix("animeshrik://").removePrefix("/")
          view?.loadUrl("http://tauri.localhost/" + pathAndQuery)
          return true
        }}
        return false
      }}
    }}
  }}
}}
"""
    with open(kt_path, 'w', encoding='utf-8') as f:
        f.write(kt_code)
    print('[patch-android] Successfully patched MainActivity.kt with custom scheme interceptor!')
else:
    print('[patch-android] Warning: No MainActivity.kt found')
