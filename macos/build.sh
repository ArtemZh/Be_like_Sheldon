#!/usr/bin/env bash
# Збірка без Xcode: Command Line Tools дають clang і SDK, а бандли складаються
# руками — це кілька файлів у теках з розширеннями .app і .saver.
#
# Виходить двоє: заставка .saver із сайтом усередині і застосунок-компаньйон —
# та сама карта на весь екран для запуску руками чи агентом простою. Сайт
# разом із даними лежить у кожному бандлі, тож мережа не потрібна.
set -euo pipefail

cd "$(dirname "$0")"
NAME="Be like Sheldon"
APP="build/${NAME} Screen.app"
BUNDLE="build/${NAME}.saver"

echo "== сайт =="
(cd ../web && VITE_BASE=/ npm run build >/dev/null)

echo "== застосунок =="
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -R ../web/dist "$APP/Contents/Resources/site"
cp Companion-Info.plist "$APP/Contents/Info.plist"

# Objective-C, а не Swift: у Command Line Tools компілятор Swift новіший за
# SDK і WebKit.swiftinterface зібрати не може. Clang робить це за десять
# секунд.
clang -fobjc-arc -O2 -mmacosx-version-min=13.0 \
  Companion.m Site.m \
  -framework Cocoa -framework WebKit -framework ScreenSaver \
  -o "$APP/Contents/MacOS/SheldonScreen"

echo "== заставка =="
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
cp Info.plist "$BUNDLE/Contents/Info.plist"
cp -R ../web/dist "$BUNDLE/Contents/Resources/site"
clang -bundle -fobjc-arc -O2 -mmacosx-version-min=13.0 \
  SheldonSaver.m Site.m \
  -framework Cocoa -framework WebKit -framework ScreenSaver \
  -o "$BUNDLE/Contents/MacOS/SheldonSaver"

# Підпису Apple Developer немає, тому підписуємо ad-hoc: на цій машині все
# запуститься, поділитись бандлом із кимось не вийде.
codesign --force --deep --sign - "$APP" 2>/dev/null
codesign --force --deep --sign - "$BUNDLE" 2>/dev/null

echo "готово: $BUNDLE ($(du -sh "$BUNDLE" | cut -f1))"
echo "встановити: cp -R \"$BUNDLE\" ~/Library/Screen\\ Savers/ && pkill -f legacyScreenSaver"
echo "перевірити окремо: open \"$APP\""
