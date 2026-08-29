# Куди доїду за день

Куди можна з'їздити потягом по Німеччині туди-назад у понеділок
(виїзд після 09:00, повернення до 23:00) — і скільки корисних годин
лишиться на місці.

Метрика — не час у дорозі, а **корисний час на місці**: вікно між приїздом
і останнім потягом назад, мінус година на вокзал, каву й хотдог.

## Збірка даних

1. Завантажити GTFS-фід Deutsche Bahn у `gtfs/db.zip`
   (джерело: https://gtfs.de/en/feeds/de_full/).
2. Створити оточення й зібрати:

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m build.cli gtfs/db.zip --out web/public/data
```

Збірка займає десятки хвилин і пише ~800 файлів у `web/public/data/origins/`.

## Тести

```bash
.venv/bin/pytest              # швидкі, на фікстурному фіді
.venv/bin/pytest -m slow      # на справжньому фіді, потребує gtfs/db.zip
```

## Фронтенд

```bash
cd web && npm install && npm run dev
```
