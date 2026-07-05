# GPS Heatmap — Правила разработки (минимум)

## 📖 Процесс разработки

1. **Задача → Архитектура → План → Подтверждение → Код → Коммит → Push (по запросу)**

2. **Читай архитектуру перед задачей:**
   - `architecture/ARCHITECTURE.md` — главный индекс
   - `architecture/PARSER.md` — детали парсинга (только если это касается парсинга)
   - `POLISH.md` — известные проблемы

3. **Перед любым кодированием:**
   - Описи план: что меняешь, где, почему
   - Жди подтверждения пользователя
   - Только после согласия начинаешь кодить

4. **После кода:**
   - "Готов закоммитить: [файлы]. Согласен?"
   - Никогда не коммитишь без подтверждения

5. **При пуше в репозиторий:**
   - Только если пользователь явно просит "push" или "commit and push"
   - Проверь: нет ли `.env` ключей, нет ли служебных файлов
   - Предупреди: "⚠️ Пушу в main" если это критично

---

## ⚠️ Запреты

- ❌ Никогда не меняй код без подтверждения
- ❌ Никогда не пуши в репозиторий без явного запроса
- ❌ Служебные файлы в коммит: `.claude/`, `.env`, `node_modules`, `__pycache__`, `.pytest_cache`
- ❌ Секреты в чат: никогда не выводи `.env`, ключи, пароли, DB_URL

---

## 🔄 После принятия решения

Обновляй соответствующий файл архитектуры:
- Новый эндпоинт → `architecture/ARCHITECTURE.md` раздел "API Endpoints"
- Новый алгоритм → `architecture/PARSER.md`
- Новый компонент → `architecture/ARCHITECTURE.md` раздел "Frontend"
- Баг или TODO → `POLISH.md`

**Всегда обновляй индекс и зависимости.**

---

## 🛠️ Инструменты

- **Frontend:** `docker compose exec -T frontend npm ...` (не локально!)
- **Backend:** `docker compose exec backend ...`
- **Build verify:** `docker compose exec -T frontend npm run build`

---

## 📝 Заметки

- Zustand stores: `appStore` (не persisted), `authStore` (persisted to localStorage `gps_auth`)
- Speed segments формат: `[{from: [lat, lon], to: [lat, lon], speed_kmh}]` — НЕ по индексам
- Database: все speed в km/h, elevation в m
- i18n: react-i18next, 5 языков (en/es/de/ru/uk) — ключи в `frontend/src/i18n/translations.js`
- Docker services: `postgres`, `redis`, `backend`, `celery_worker`, `frontend`

