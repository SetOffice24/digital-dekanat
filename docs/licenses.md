# Лицензии сторонних ресурсов

| Ресурс | Где используется | Лицензия |
|---|---|---|
| PT Sans (Regular, Bold), © 2010 ParaType Ltd. | PDF-справки, `public/fonts/PTSans-*.ttf`; источник: github.com/google/fonts (ofl/ptsans) | SIL Open Font License 1.1, текст — `public/fonts/OFL-PTSans.txt` |


## Изображения
- `public/bg/login.webp` — фон экрана входа, сгенерирован нейросетью OpenAI (gpt-image-2.5-flare) по промпту команды; права на результат принадлежат команде согласно условиям OpenAI.
- `public/bg/sky.svg` — пейзаж-подложка, нарисован вручную (SVG) в рамках проекта.
- Логотип «Универ» (`src/components/logo.tsx`, `public/icon.svg`) — собственная разработка проекта.
- Шрифт Unbounded — SIL Open Font License 1.1 (пакет `@fontsource-variable/unbounded`).
- Шрифт Onest — SIL Open Font License 1.1 (пакет `@fontsource-variable/onest`).
- `web-push` — MPL-2.0 (отправка push-уведомлений).
- `sharp` — Apache-2.0 (обработка фото студентов: обрезка 3:4, перекодирование в JPEG, удаление EXIF; рисунки-силуэты демо-фото в `prisma/seed-photos.ts`). Демо-фото — нарисованные силуэты, не фотографии реальных людей.
- `docx`, `exceljs`, `pptxgenjs` — MIT; только для разработки: генерация демо-файлов Word/Excel/PowerPoint (`scripts/make-fixtures.mjs`). Сами файлы в `prisma/fixtures/` — собственные вымышленные учебные материалы проекта.
- Иконки PWA (`public/icons/*`) — нарисованы из собственного логотипа проекта.
- `unpdf` — MIT (извлечение текста из PDF для библиотеки знаний помощника).
- `mammoth` — BSD-2-Clause (извлечение текста из Word .docx для библиотеки знаний помощника).
