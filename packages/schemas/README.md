# @incasif/schemas

Kontrak zod **tunggal** untuk backend (validasi), frontend web/mobile (form), dan `@incasif/api-client` (typed client). OpenAPI di-generate dari zod — dokumentasi tidak pernah drift dari kode (SDD §11).

## Struktur

```
src/
├── common.ts        Fondasi semua domain: error envelope {code,message,hint?},
│                    success envelope {data,meta?}, pagination cursor, id, timestamp
├── auth.ts          Contoh skema lengkap (requestOtpSchema) — acuan konvensi
├── <domain>.ts      Skeleton per domain, diisi bertahap per PR fitur
├── openapi.ts       Builder dokumen OpenAPI (tidak diekspor dari index)
└── index.ts         Barrel export
scripts/
└── gen-openapi.ts   Generator + mode --check (diff CI)
openapi.json         Hasil generate — di-commit, JANGAN diedit manual
```

## Konvensi Penamaan

| Hal                | Konvensi                                   | Contoh                                               |
| ------------------ | ------------------------------------------ | ---------------------------------------------------- |
| Skema              | camelCase + suffix `Schema`                | `requestOtpSchema`                                   |
| Skema request body | `<aksi><Entitas>Schema`                    | `createJobSchema`                                    |
| Skema response     | `<aksi><Entitas>ResponseSchema`            | `requestOtpResponseSchema`                           |
| Skema query/params | `<nama>QuerySchema` / `<nama>ParamsSchema` | `paginationQuerySchema`                              |
| Tipe TS            | PascalCase via `z.infer`, tanpa suffix     | `type RequestOtp = z.infer<typeof requestOtpSchema>` |
| Component OpenAPI  | PascalCase via `.openapi({ ref })`         | `ref: "RequestOtp"`                                  |
| File               | satu file per domain, camelCase            | `src/jobs.ts`                                        |
| Pesan error zod    | Bahasa Indonesia sederhana                 | `"limit maksimal 100"`                               |

Aturan tambahan:

- **Impor relatif pakai ekstensi `.js`** (ESM NodeNext): `import { idSchema } from "./common.js"`.
- Setiap file domain mengimpor `"zod-openapi/extend"` sebelum memakai `.openapi()`.
- Response sukses selalu `{data, meta?}` — pakai `successEnvelopeSchema(dataSchema)` dari `common.ts`.
- Response error selalu `ErrorEnvelope` — jangan buat bentuk error baru.

## Menambah / Mengubah Skema

```bash
# 1. Tulis/ubah skema di src/<domain>.ts (+ unit test valid & invalid)
# 2. Kalau skema tampil di API: daftarkan path-nya di src/openapi.ts
# 3. Regenerate openapi.json
pnpm --filter @incasif/schemas gen:openapi

# 4. Commit skema + openapi.json BERSAMA dalam satu commit
```

## Drift Check (CI)

`openapi.json` wajib selalu sinkron dengan skema zod. CI menjalankan:

```bash
pnpm --filter @incasif/schemas check:openapi   # beda → exit 1 → CI merah
```

Generator **deterministik**: tanpa timestamp, versi kontrak di-pin manual (`CONTRACT_VERSION` di `src/openapi.ts`), urutan mengikuti deklarasi — dua kali generate menghasilkan byte identik (diuji di unit test).

Lihat hasilnya: buka `openapi.json` di [Swagger Editor](https://editor.swagger.io/).
