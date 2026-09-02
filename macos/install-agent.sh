#!/usr/bin/env bash
# Ставить агента, який вмикає карту після простою. Аргумент — скільки секунд
# чекати (за замовчуванням 300, тобто пʼять хвилин).
set -euo pipefail

cd "$(dirname "$0")"
AFTER="${1:-300}"
HERE="$(pwd)"
APP="$HERE/build/Be like Sheldon Screen.app"
LABEL="ua.zhavrotskyi.sheldonscreen"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -d "$APP" ] || { echo "спершу зберіть: ./build.sh"; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|ЗАМІНИТИ/idle-watch.sh|$HERE/idle-watch.sh|" \
    -e "s|ЗАМІНИТИ/Be like Sheldon Screen.app|$APP|" \
    -e "s|<string>300</string>|<string>$AFTER</string>|" \
    "$LABEL.plist" > "$PLIST"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "агент поставлено: карта вмикається після $AFTER с простою"
echo "вимкнути: launchctl bootout gui/$UID/$LABEL && rm \"$PLIST\""
echo
echo "Не забудьте вимкнути системну заставку: Системні налаштування →"
echo "Заставка → «Запускати після: Ніколи» — інакше вона перекриє карту."
