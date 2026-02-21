#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT_PATH="$REPO_ROOT/ios-native/MerkenIOS.xcodeproj"
SCHEME="MerkenIOS"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "[FAIL] xcodebuild が見つかりません。"
  exit 1
fi

echo "=== Xcode Version ==="
xcodebuild -version || true

echo
echo "=== Installed iOS SDKs ==="
SDK_OUTPUT="$(xcodebuild -showsdks | sed -n '/iOS SDKs:/,/iOS Simulator SDKs:/p')"
echo "$SDK_OUTPUT"

echo
echo "=== Installed iOS Simulator Runtimes ==="
RUNTIME_OUTPUT="$(xcrun simctl list runtimes | grep 'iOS' || true)"
echo "$RUNTIME_OUTPUT"

echo
echo "=== Connected Devices (xctrace) ==="
DEVICE_OUTPUT="$(xcrun xctrace list devices || true)"
echo "$DEVICE_OUTPUT" | sed -n '1,40p'

echo
echo "=== Xcode Destinations for $SCHEME ==="
if [ ! -d "$PROJECT_PATH" ]; then
  echo "[FAIL] Project not found: $PROJECT_PATH"
  exit 1
fi
DEST_OUTPUT="$(xcodebuild -scheme "$SCHEME" -project "$PROJECT_PATH" -showdestinations 2>/dev/null || true)"
echo "$DEST_OUTPUT" | sed -n '/Available destinations/,$p'

echo
echo "=== Verdict ==="
HAS_IOS26_SDK=0
if xcodebuild -showsdks | grep -q 'iOS 26'; then
  HAS_IOS26_SDK=1
fi

HAS_REAL_DEVICE_DEST=0
if echo "$DEST_OUTPUT" | grep 'platform:iOS,' | grep -v 'DVTiPhonePlaceholder' | grep -q 'id:'; then
  HAS_REAL_DEVICE_DEST=1
fi

if [ "$HAS_IOS26_SDK" -eq 1 ] && [ "$HAS_REAL_DEVICE_DEST" -eq 1 ]; then
  echo "[OK] 実行準備完了。Xcode の再生ボタンで実機実行できます。"
  exit 0
fi

echo "[NG] まだ実行準備が不足しています。"
if [ "$HAS_IOS26_SDK" -eq 0 ]; then
  echo " - iOS 26 SDK が未インストールです。Xcode/iOS runtime を更新してください。"
fi
if [ "$HAS_REAL_DEVICE_DEST" -eq 0 ]; then
  echo " - 実機 destination が表示されていません。"
  echo "   iPhone のデベロッパモード・信頼設定・Xcode の Use for Development を確認してください。"
fi

exit 2
