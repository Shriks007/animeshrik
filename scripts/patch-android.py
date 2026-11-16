import os
import glob

# Recursively patch any AndroidManifest.xml under src-tauri/gen/android
deep_link_filter = """
        <intent-filter>
          <action android:name="android.intent.action.VIEW" />
          <category android:name="android.intent.category.DEFAULT" />
          <category android:name="android.intent.category.BROWSABLE" />
          <data android:scheme="animeshrik" />
        </intent-filter>
"""

manifest_files = glob.glob('src-tauri/gen/android/**/AndroidManifest.xml', recursive=True)

if not manifest_files:
    print('[patch-android] Warning: No AndroidManifest.xml found matching pattern')

for manifest_path in manifest_files:
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            content = f.read()

        if 'android:scheme="animeshrik"' not in content and '</activity>' in content:
            content = content.replace('</activity>', deep_link_filter + '\n    </activity>')
            with open(manifest_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'[patch-android] Injected animeshrik scheme into {manifest_path}')
        else:
            print(f'[patch-android] Skipped {manifest_path} (already patched or no activity tag)')
    except Exception as e:
        print(f'[patch-android] Error patching {manifest_path}: {e}')
