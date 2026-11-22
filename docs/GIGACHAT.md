# Подключение GigaChat к умному помощнику

Официальная инструкция: developers.sber.ru → GigaChat → «Начало работы с API».

## Что нужно

1. **Authorization Key** — в личном кабинете Studio: проект GigaChat API → «Настройки API» → «Получить ключ». Ключ показывается один раз, сохраните его сразу. Получить его может только Владелец или Администратор проекта.
2. **Scope**:
   - `GIGACHAT_API_PERS` — физлицо;
   - `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP` — ИП или юрлицо.
3. **Модель:** на адресе `api.giga.chat` обычная модель называется `GigaChat-2` (также есть `GigaChat-2-Pro`, `GigaChat-2-Max`, `GigaChat-3-…`). Просто `GigaChat` там нет — будет ошибка 404 «No such model». Список моделей для вашего ключа — `GET https://api.giga.chat/v1/models`.

## Куда записать

### Локально

Файл `digital-dekanat\.env` (он не попадает в git):

```
AI_PROVIDER="gigachat"
GIGACHAT_AUTH_KEY="…Authorization Key…"
GIGACHAT_SCOPE="GIGACHAT_API_PERS"
AI_MODEL="GigaChat-2"
```

После правки перезапустите сайт: `.env` читается только при старте. Больше ничего не нужно: сертификат Минцифры, которым подписаны серверы GigaChat, в Windows уже установлен, и адаптер сам берёт его из системного хранилища (проверено 22.11: ответ модели через сайт за ~1 с).

### На сервере (VPS)

1. Те же строки запишите в `/opt/univer/deploy/.env`, права `600`.
2. Внутри Docker (Linux) сертификата Минцифры нет, поэтому один раз нужно:
   - скачать с https://www.gosuslugi.ru/crt корневой сертификат «Russian Trusted Root CA» в формате PEM (текст начинается с `-----BEGIN CERTIFICATE-----`);
   - положить его в `/opt/univer/deploy/certs/russian_trusted_root_ca.pem`;
   - добавить в `deploy/.env` строку `GIGACHAT_CA_FILE=/app/certs/russian_trusted_root_ca.pem`.
3. Перезапустите приложение: `cd /opt/univer/deploy && docker compose up -d app`.

Ключ нельзя писать в `.env.example`, код, коммиты и переписку.

## Как это работает

Код находится в `src/server/ai/llm.ts`. Это ровно две операции из инструкции Сбера:

1. `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth` с Authorization Key — получаем токен на 30 минут. Токен хранится в памяти и обновляется заранее.
2. `POST https://api.giga.chat/v1/chat/completions` с этим токеном — запрос к модели. `temperature` не передаётся, как советует документация.

Если ключа нет, он неверный или GigaChat не отвечает, помощник работает по встроенным правилам. Сайт не ломается.

## Если не работает

Смотрите журнал сервера: окно `pnpm dev`, на сервере — `docker compose logs app --tail 50`. Ключ в журнал не пишется.

- `GigaChat OAuth HTTP 401` — неверный ключ или scope.
- `GigaChat HTTP 404` — неверное название модели в `AI_MODEL`.
- `GigaChat HTTP 402` — закончился пакет токенов.
- `… certificate …` — на сервере не найден сертификат, смотрите пункт 2 для сервера.
