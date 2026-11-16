import os

# Patch AndroidManifest.xml for custom scheme intent filter so the system browser can launch AnimeShrik
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
