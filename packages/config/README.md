
# @incasif/config

Preset bersama (shared config) untuk seluruh workspace Incasif: TypeScript, ESLint, Prettier, dan **ESLint boundaries** (arsitektur sebagai kode).

## Isi Paket

| Export | Isi |
|--------|-----|
| `@incasif/config/tsconfig/base` | tsconfig strict dasar |
| `@incasif/config/tsconfig/node` | turunan base untuk app Node (api, worker) |
| `@incasif/config/tsconfig/react` | turunan base untuk app React (web, ui) |
| `@incasif/config/prettier` | konfigurasi Prettier bersama |
| `@incasif/config/eslint` | preset ESLint dasar (semua app & paket) |
| `@incasif/config/eslint/boundaries` | preset ESLint + **boundaries** (khusus `apps/api`) |

## Preset ESLint Dasar

Untuk app/paket biasa (web, mobile, worker, packages):

```js
// .eslintrc.cjs
module.exports = require("@incasif/config/eslint");
```

## Preset Boundaries (Arsitektur sebagai Kode)

Dipakai **hanya oleh `apps/api`** — satu-satunya artefak dengan modul & lapisan (monolith modular, ADR-001). Menegakkan aturan SDD §5.1 / ADR-012 secara otomatis, bukan lewat disiplin manual.

```js
// apps/api/.eslintrc.cjs
module.exports = require("@incasif/config/eslint/boundaries");
```

### Klasifikasi Elemen

Setiap file di `apps/api` diklasifikasikan dari path-nya:

| Tipe | Pattern | Keterangan |
|------|---------|------------|
| `core-ai` | `src/core/ai` | Satu-satunya tempat SDK AI boleh diimpor (AI Gateway) |
| `core` | `src/core/*` | Shared: http, auth, config |
| `router` | `src/modules/*/routers` | Lapisan route |
| `controller` | `src/modules/*/controllers` | Lapisan controller |
| `service` | `src/modules/*/services` | Lapisan business logic |
| `repository` | `src/modules/*/repositories` | Lapisan akses DB |
| `module-shared` | `src/modules/*` | File modul lain (types.ts, index.ts) |

Nama modul (`auth`, `jobs`, dst.) di-`capture` sehingga aturan bisa membedakan "modul sama" vs "modul berbeda".

### Aturan yang Ditegakkan

**1. Lapisan satu arah — `router → controller → service → repository`.**
Dilarang loncat lapisan. Router hanya boleh ke controller-nya sendiri; controller ke service-nya sendiri; service ke repository-nya sendiri.

```ts
// ❌ router impor repository → boundaries/element-types error
import { jobsRepository } from "../repositories/jobs.repository";
```

**2. Dilarang impor repository lintas modul.**
Antar-modul hanya lewat **service layer**. Service modul A boleh memanggil service modul B, tapi tidak boleh menyentuh repository modul B.

```ts
// ❌ service jobs impor repo users → boundaries/element-types error
import { usersRepository } from "../../users/repositories/users.repository";

// ✅ boleh: service → service
import { usersService } from "../../users/services/users.service";
```

**3. Dilarang impor SDK AI langsung di luar `core/ai`.**
Semua panggilan LLM lewat AI Gateway (ADR-012) demi kontrol kuota, privasi, dan fallback.

```ts
// ❌ di modul mana pun selain core/ai → boundaries/external error
import { GoogleGenerativeAI } from "@google/generative-ai";
```

SDK yang diblokir: `@google/generative-ai`, `groq-sdk`, `openai`.

### Escape Hatch

Jika sebuah pelanggaran memang disengaja dan sudah di-review, nonaktifkan per-baris dan catat alasannya:

```ts
// eslint-disable-next-line boundaries/element-types -- alasan + tautan review
```

## Bukti Gate Bekerja (Fixtures + Test)

`fixtures/` berisi struktur modul mini beserta contoh **valid** dan **pelanggaran** tiap aturan. `__tests__/boundaries.test.ts` me-lint fixtures secara programatik lewat ESLint Node API dan memastikan:

- pelanggaran memunculkan rule ID yang tepat (`boundaries/element-types`, `boundaries/external`),
- aliran lapisan yang benar nol pelanggaran boundaries.

```bash
pnpm --filter @incasif/config test
```

Fixtures sengaja diletakkan di luar `__tests__/` (yang masuk `boundaries/ignore`) agar tetap terklasifikasi, dan di-`ignore` dari lint/format/typecheck normal.
