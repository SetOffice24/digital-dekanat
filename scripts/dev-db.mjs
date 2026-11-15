// Локальный PostgreSQL для разработки без Docker (Windows). На сервере используется Docker Compose.
// Запуск: pnpm db:local  (держит процесс открытым; Ctrl+C — остановка)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = "./.devdb";
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "univer", password: "univer_dev", port: 5433, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"] });

const fresh = !existsSync(dir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("univer");
console.log("Dev PostgreSQL running on localhost:5433 (db univer)");

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
