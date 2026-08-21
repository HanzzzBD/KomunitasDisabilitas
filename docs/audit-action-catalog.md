# Katalog Action Audit
Katalog ini adalah kontrak `core/audit` (SDD §8.3). Pemakaian: `auditLog({ actorId, requestId }, action, entity, entityId, meta)`; key meta di luar daftar dibuang sebelum insert.
| Action | Kapan dipakai | Meta aman |
| --- | --- | --- |
| `AUTH_LOGIN_FAILED` | Login gagal beruntun | `reason` |
| `AUTH_LOGIN_SUCCEEDED` | Login berhasil (pembanding lonjakan kegagalan) | `method`, `isNewUser` |
| `AUTH_REFRESH_REUSED` | Refresh token tercabut dipakai lagi — indikasi pencurian | `revokedCount` |
| `ACCOUNT_EMAIL_CHANGED` | Pemilik mengubah/mengosongkan email akun | `hadPreviousEmail`, `cleared` |
| `PROFILE_SENSITIVE_READ` | Baca data disabilitas/akomodasi | `purpose`, `fields`, `reason`, `count` |
| `PROFILE_SENSITIVE_UPDATED` | Simpan/hapus data disabilitas/akomodasi, dan pemberian/pencabutan consent-nya | `operation`, `fields` |
| `APPLICATION_STATUS_CHANGED` | Perubahan status lamaran | `from`, `to` |
| `COMPANY_VERIFIED` | Verifikasi perusahaan | `from`, `to` |
| `ADMIN_RESOURCE_CHANGED` | Aksi admin terhadap resource | `operation` |
| `DATA_EXPORTED` | Ekspor data subjek | `format`, `formatVersion`, `sections` |
| `ACCOUNT_DELETED` | Konfirmasi hapus akun ditolak/diterima, dan selesainya penghapusan | `stage`, `method`, `revokedCount` |
| `DATA_PURGED` | Purge/anonimisasi terjadwal akun terhapus > 30 hari | `dryRun`, `accounts`, `deleted`, `anonymized`, `records` |
| `DATA_RETAINED` | Penghapusan terjadwal menurut kebijakan retensi (SDD §6.4) | `dryRun`, `policy`, `deleted`, `remaining`, `monthsAggregated` |
| `JOB_AUTO_CLOSED` | Lowongan ditutup otomatis karena melewati `expires_at` | `dryRun`, `closed`, `remaining` |

Jangan masukkan nama, telepon, email, nilai disabilitas, kebutuhan akomodasi, token, atau nilai field sensitif lain ke `meta`. Katalog dipetakan pada PR modul terkait; baca massal dicatat per-job, bukan per-record. Satu-satunya teks bebas di seluruh katalog ini adalah `PROFILE_SENSITIVE_READ.reason` — pengecualian yang disengaja, dengan harga yang dijelaskan di bawah.

Perhatikan `ACCOUNT_DELETED`: `stage` dibaca sebagai **rangkaian**, bukan tiga kejadian lepas. `rejected` berulang atas satu akun berarti ada yang memegang access token-nya tetapi tidak memegang kredensialnya; `requested` tanpa `completed` berarti pembuktian lolos tetapi transaksi penghapusan gagal — akun itu perlu diperiksa tangan sebelum purge (PR-023).

Perhatikan `PROFILE_SENSITIVE_READ` (PR-039, selengkapnya di [akses-data-sensitif.md](akses-data-sensitif.md)): `purpose` menentukan **bagaimana** barisnya ditulis, bukan sekadar melabelinya. `support` dan `disclosure` ditulis per panggilan dengan `entityId` = subjeknya. `matching` ditulis **agregat**: satu baris per hari × pelaku, `entityId` **null** — barisnya berbicara tentang satu job, bukan satu orang — dan `count` berisi berapa profil dibaca. `reason` dan `requestId` pada baris agregat diambil dari panggilan pertama di periode itu, karena keduanya menjawab "apa yang memulai pembacaan massal ini" dan jawabannya tidak berubah karena batch-nya panjang. Pembacaan oleh **pemiliknya sendiri** tidak dicatat sama sekali: satu baris per pembukaan halaman profil akan menenggelamkan pembacaan oleh pihak lain — satu-satunya yang perlu ditemukan saat menyelidiki.

`reason` adalah teks bebas 1–200 karakter, dan itu melanggar aturan "meta hanya enum/angka" di atas dengan sengaja: pertanyaan yang diajukan orang saat menyelidiki pembacaan data disabilitas bukan "kapan" melainkan **"kenapa"**, dan enum tertutup atas alasan hanya akan menghasilkan satu nilai `lainnya` yang dipakai untuk segalanya. Harganya ditanggung operator, dan tidak ada validasi yang bisa menagihnya: **jangan tulis nama, nomor, email, atau kondisi seseorang di dalam `reason`.** Tulis nomor tiket dan apa yang sedang dikerjakan — `"tiket #4821 — akomodasi tidak muncul di lamaran"`, bukan `"cek disabilitas Budi 0812…"`. Ingat retensinya: `audit_logs` bertahan 2 tahun (SDD §6.4), jadi PII yang masuk ke sini hidup jauh melewati baris yang memilikinya.

Perhatikan `PROFILE_SENSITIVE_UPDATED`: `operation` membedakan tiga peristiwa yang berbeda arah — `consentGranted` (pengguna mengizinkan penyimpanan data disabilitas), `fieldsUpdated` (isinya berubah), dan `consentRevoked` (izin dicabut, dan seluruh field sensitif DIHAPUS). Tanpa pembedaan itu, "kapan data saya dihapus?" tidak bisa dijawab dari audit — dan itu justru pertanyaan yang membuat jejak ini ada. Satu permintaan boleh menghasilkan DUA baris (mis. memberi consent sekaligus mengisi data); keduanya berbagi `requestId`.

Perhatikan `ACCOUNT_EMAIL_CHANGED`: yang dicatat adalah **fakta perubahannya**, bukan alamatnya. `audit_logs` bertahan 2 tahun (SDD §6.4) — menaruh email di sana berarti menyimpan PII jauh melewati baris yang memilikinya. Alamat saat ini selalu bisa dibaca dari `users` lewat jalur yang punya kontrol aksesnya sendiri.
