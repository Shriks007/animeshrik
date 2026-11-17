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

        if 'android:launchMode' not in content:
            content = content.replace('<activity', '<activity\n            android:launchMode="singleTask"')
            print(f'[patch-android] Added android:launchMode="singleTask" to {manifest_path}')

        if 'android:scheme="animeshrik"' not in content and '</activity>' in content:
            content = content.replace('</activity>', deep_link_filter + '\n    </activity>')
            with open(manifest_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'[patch-android] Injected animeshrik scheme into {manifest_path}')
        else:
            with open(manifest_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'[patch-android] Updated {manifest_path}')
    except Exception as e:
        print(f'[patch-android] Error patching {manifest_path}: {e}')

# Patch build.gradle.kts for permanent signing and incremented versionCode
gradle_files = glob.glob('src-tauri/gen/android/**/build.gradle.kts', recursive=True)
signing_block = """
    signingConfigs {
        create("release") {
            val ksFile = rootProject.file("../../release.keystore")
            storeFile = if (ksFile.exists()) ksFile else rootProject.file("release.keystore")
            storePassword = "animeshrik123"
            keyAlias = "animeshrik"
            keyPassword = "animeshrik123"
        }
    }
"""

for gradle_path in gradle_files:
    if 'app/build.gradle.kts' in gradle_path or 'app\\build.gradle.kts' in gradle_path:
        try:
            with open(gradle_path, 'r', encoding='utf-8') as f:
                gcontent = f.read()

            if 'signingConfigs {' not in gcontent and 'android {' in gcontent:
                gcontent = gcontent.replace('android {', 'android {' + signing_block)
                if 'getByName("debug") {' in gcontent:
                    gcontent = gcontent.replace('getByName("debug") {', 'getByName("debug") {\n            signingConfig = signingConfigs.getByName("release")')
                if 'getByName("release") {' in gcontent:
                    gcontent = gcontent.replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")')
                
                # Ensure versionCode is updated to 203
                import re
                gcontent = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 203', gcontent)
                gcontent = re.sub(r'versionName\s*=\s*"[^"]*"', 'versionName = "2.0.3"', gcontent)

                with open(gradle_path, 'w', encoding='utf-8') as f:
                    f.write(gcontent)
                print(f'[patch-android] Injected permanent signingConfigs and v2.0.3 into {gradle_path}')
        except Exception as e:
            print(f'[patch-android] Error patching {gradle_path}: {e}')

