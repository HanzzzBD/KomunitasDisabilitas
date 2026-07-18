# @incasif/api-client

Typed API client dari kontrak zod (`@incasif/schemas`) — dipakai **web dan mobile** tanpa perubahan (ADR-014). Bebas dependensi DOM: jalan di browser, React Native, dan Node ≥ 18. `sideEffects: false` — tree-shakeable (diuji bundle test).

## Pemakaian

```ts
import { createApiClient, requestOtp, ApiError } from "@incasif/api-client";

const client = createApiClient({
  baseUrl: "https://incasif.id/api/v1",
  // Penyimpanan token DI LUAR paket ini:
  // web → cookie/memory store; mobile → expo-secure-store.
  getAccessToken: () => tokenStore.access,
  // Hook refresh 401 — STUB sampai PR-018 (default: selalu false).
  refresh: async () => tokenStore.tryRefresh(),
});

try {
  const res = await requestOtp(client, { phone: "+6281234567890" });
  console.log(res.data.retryAfterSeconds);
} catch (e) {
  if (e instanceof ApiError) {
    // {code, message, hint?} — message Bahasa Indonesia, siap ditampilkan
    // & dibacakan screen reader tanpa transformasi.
    show(e.message, e.hint);
  }
}
```

## Perilaku Inti

| Hal                    | Perilaku                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Error API              | Semua bermuara ke `ApiError` (`code`, `message`, `hint?`, `status`)                                     |
| Error jaringan         | `JARINGAN_GAGAL`, status 0 — fetch tidak pernah sampai server                                           |
| Body error tak dikenal | `RESPONS_TIDAK_DIKENAL` — teks mentah server tidak diteruskan ke pengguna                               |
| 401                    | Panggil `refresh()` **sekali** → bila true, retry **sekali** dengan token terbaru; tidak pernah loop    |
| Validasi response      | Endpoint memberi `responseSchema` zod → drift runtime terdeteksi (`RESPONS_TIDAK_DIKENAL`)              |
| Token                  | Hanya dibaca via `getAccessToken()` saat menyusun header; **tidak pernah di-log atau ikut objek error** |

## Konvensi Query Key (TanStack Query)

Bentuk key: **`[domain, params]`** — `params` dinormalisasi (urutan key stabil, `undefined` dibuang) sehingga deterministik.

```ts
import { queryKey } from "@incasif/api-client";

queryKey("jobs"); // ["jobs"]
queryKey("jobs", { q: "kasir", page: 2 }); // ["jobs", { page: 2, q: "kasir" }]

// Per domain, sediakan factory di endpoints/<domain>.ts:
authKeys.otpRequest("+62812…"); // ["auth", { intent: "otp-request", phone: … }]
```

Aturan:

- `domain` = nama modul backend (`auth`, `jobs`, `applications`, …).
- Invalidasi seluruh domain: `queryClient.invalidateQueries({ queryKey: ["jobs"] })`.
- Jangan buat key ad-hoc di komponen — selalu lewat factory `…Keys` dari paket ini.

## Menambah Endpoint

Pola di `src/endpoints/auth.ts` (contoh PR-005):

1. Ambil skema request+response dari `@incasif/schemas` — **jangan** definisikan skema di sini.
2. Validasi body dengan `schema.parse` sebelum kirim (fail cepat di klien).
3. Beri `responseSchema` agar response tervalidasi.
4. Ekspor factory `…Keys` untuk query key domain tersebut.
5. Paket TanStack Query dipasang di apps — paket ini hanya menyediakan fungsi fetch + key.
