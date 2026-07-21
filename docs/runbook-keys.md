# Runbook — Rotasi Kunci Enkripsi Field (`FIELD_KEY_Vn`)

> Terkait: ADR-007 (AES-256-GCM), ADR-015 (secrets via env), PR-013 (`core/crypto`).
> Modul: `apps/api/src/core/crypto/index.ts`.

## 1. Konsep

Field sensitif (`disability_types`, `accommodation_needs`, dst.) dienkripsi di level
aplikasi dengan **AES-256-GCM** dan disimpan sebagai `bytea` berformat:

```
[1 byte versi][12 byte IV][16 byte auth tag][n byte ciphertext]
```

- Kunci berasal dari environment variable **`FIELD_KEY_V1`, `FIELD_KEY_V2`, …** —
  masing-masing base64 dari **tepat 32 byte**.
- **Enkripsi baru SELALU memakai versi tertinggi** yang tersedia (`activeVersion`).
- **Dekripsi membaca byte versi** pada ciphertext → memilih kunci yang sesuai.
  Data lama tetap terbaca selama kunci versinya masih terpasang → **rotasi tanpa
  downtime**.
- Kunci **hanya hidup di memori aplikasi**. Tidak pernah masuk database, query
  log, atau backup. Redaction pino (`fieldKey`, PR-006) adalah lapisan kedua.

## 2. Membuat kunci baru

```bash
openssl rand -base64 32
```

Output = satu baris base64 (44 karakter, diakhiri `=`). Verifikasi panjang:

```bash
echo -n '<hasil>' | base64 -d | wc -c   # harus 32
```

Aturan format (ditegakkan `parseFieldKeys` saat boot):

- Base64 valid dari **tepat 32 byte** — selain itu boot **gagal** (`FieldKeyError`).
- Versi `1..255` tanpa nol di depan (`FIELD_KEY_V2`, bukan `FIELD_KEY_V02`).
- Minimal satu kunci wajib ada; boot tanpa `FIELD_KEY_V1` gagal.

## 3. Rotasi kunci (prosedur normal)

Rotasi memperkenalkan versi baru **tanpa** membaca ulang data lama seketika.

1. **Generate** kunci baru (§2).
2. **Tambahkan** sebagai versi berikutnya di secret store / env produksi —
   JANGAN hapus kunci lama:
   ```
   FIELD_KEY_V1=<kunci lama>
   FIELD_KEY_V2=<kunci baru>
   ```
3. **Deploy / restart** aplikasi. Setelah boot:
   - `activeVersion` = 2 → semua enkripsi baru memakai V2.
   - Data ber-versi 1 tetap terbaca (kunci V1 masih terpasang).
4. **Verifikasi**: baca beberapa record lama (harus sukses) dan tulis record baru
   (byte versi = 2). Lihat §6 untuk verifikasi di dev.
5. **Re-encrypt bertahap** (opsional, untuk akhirnya me-retire V1): jalankan job
   background yang membaca field V1 lalu menuliskannya kembali (otomatis ter-enkripsi
   V2). Job re-encrypt = **out of scope PR-013** (menyusul bersama modul profiles,
   PR-037+). `versionOf(field)` tersedia untuk memilih baris yang belum ter-migrasi.

## 4. Me-retire kunci lama

Hanya setelah **dipastikan tidak ada lagi ciphertext ber-versi lama** (§3 langkah 5
selesai, diverifikasi via query monitoring versi):

1. Hapus `FIELD_KEY_V<lama>` dari env / secret store.
2. Restart aplikasi.
3. Jika masih ada data versi lama yang tersisa, dekripsinya akan melempar
   `DekripsiError` ("versi kunci … tidak tersedia") — **jangan retire sebelum
   migrasi tuntas**.

## 5. Kompromi kunci (insiden)

Jika `FIELD_KEY_Vn` diduga bocor (T8 SDD §20):

1. **Segera** generate kunci baru dan jadikan versi aktif (§3 langkah 1–3) agar
   data baru tidak lagi memakai kunci yang bocor.
2. Prioritaskan **re-encrypt** seluruh data ber-versi bocor ke versi baru (§3
   langkah 5), lalu **retire** versi bocor (§4).
3. Anggap semua data yang pernah ter-enkripsi dengan kunci bocor **berpotensi
   terekspos** bila ciphertext-nya juga bocor (mis. dump DB). Ikuti prosedur
   notifikasi insiden data pribadi (UU PDP) sesuai kebijakan tim.
4. Rotasi kredensial terkait: siapa pun yang punya akses ke secret store.

## 6. Verifikasi rotasi di dev

```bash
# 1. Boot dengan hanya V1 (dari apps/api/.env) → enkripsi menghasilkan versi 1.
# 2. Tambah FIELD_KEY_V2 (openssl rand -base64 32) ke apps/api/.env.
# 3. Restart; enkripsi baru = versi 2, data versi 1 tetap terbaca.
```

Terotomasi di test:

- `apps/api/__tests__/crypto.test.ts` → grup "rotasi multi-versi" membuktikan data
  V1 tetap terbaca setelah V2 aktif, dan retire V1 → `DekripsiError`.
- `apps/api/__tests__/crypto-boot.test.ts` → membuktikan boot **gagal** bila kunci
  hilang/salah panjang, **sebelum** server listen.

## 7. Penyimpanan & DR (ADR-015)

- `.env` produksi: `chmod 600`, non-root, di luar git.
- Semua kunci (termasuk versi lama yang masih dipakai) disimpan di **password
  manager tim** untuk pemulihan bencana — kehilangan kunci = kehilangan data
  terenkripsi secara permanen (tidak ada recovery).
- Jangan pernah menempelkan kunci ke chat, tiket, atau log. Rujuk kunci dengan
  nama variabel (`FIELD_KEY_V2`), bukan nilainya.

## 8. Troubleshooting

| Gejala saat boot / runtime | Penyebab | Tindakan |
|---|---|---|
| `FieldKeyError: ... FIELD_KEY_V1: wajib diisi` | Tidak ada `FIELD_KEY_V*` | Set minimal `FIELD_KEY_V1` (§2). |
| `FieldKeyError: ... harus base64 valid dari kunci tepat 32 byte` | Kunci bukan 32 byte / base64 rusak | Regenerate dengan `openssl rand -base64 32`. |
| `FieldKeyError: ... versi harus 1..255 tanpa nol di depan` | Nama env salah (mis. `FIELD_KEY_V01`, `FIELD_KEY_V256`) | Gunakan `FIELD_KEY_V1..V255`. |
| `DekripsiError: versi kunci N tidak tersedia` | Kunci versi N sudah di-retire tapi data-nya masih ada | Pasang kembali `FIELD_KEY_VN`, selesaikan re-encrypt (§3), baru retire. |
| `DekripsiError: autentikasi gagal` | Ciphertext berubah / kunci salah untuk versi itu | Cek integritas data & kebenaran kunci versi tersebut; jangan abaikan (indikasi tampering). |
