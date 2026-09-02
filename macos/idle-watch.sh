#!/usr/bin/env bash
# Вмикає карту після простою — замість системної заставки.
#
# Чому не через .saver: поки працює системна заставка, macOS не показує над
# нею вікна звичайних застосунків, а всередині самої заставки WebKit не
# оновлює картинку (див. HANDOFF.md). Тому простій ловимо самі: HIDIdleTime
# рахує наносекунди від останнього руху миші чи клавіші.
set -euo pipefail

APP="${1:?вкажіть шлях до Be like Sheldon Screen.app}"
AFTER="${2:-300}"  # скільки секунд простою чекати

# Без раннього виходу з awk: інакше ioreg отримує SIGPIPE і скрипт падає.
idle=$(ioreg -c IOHIDSystem \
  | awk '/HIDIdleTime/ && !seen {print int($NF / 1000000000); seen = 1}')

# Уже показуємо — нічого не робимо.
if pgrep -x SheldonScreen >/dev/null; then
  exit 0
fi

if [ "${idle:-0}" -ge "$AFTER" ]; then
  open "$APP"
fi
