# Katalog Action Audit
Katalog ini adalah kontrak `core/audit` (SDD §8.3). Pemakaian: `auditLog({ actorId, requestId }, action, entity, entityId, meta)`; key meta di luar daftar dibuang sebelum insert.
| Action | Kapan dipakai | Meta aman |
| --- | --- | --- |
| `AUTH_LOGIN_FAILED` | Login gagal beruntun | `reason` |
| `PROFILE_SENSITIVE_READ` | Baca data disabilitas/akomodasi | `purpose`, `fields` |
| `PROFILE_SENSITIVE_UPDATED` | Ubah data disabilitas/akomodasi | `fields` |
| `APPLICATION_STATUS_CHANGED` | Perubahan status lamaran | `from`, `to` |
| `COMPANY_VERIFIED` | Verifikasi perusahaan | `from`, `to` |
| `ADMIN_RESOURCE_CHANGED` | Aksi admin terhadap resource | `operation` |
| `DATA_EXPORTED` | Ekspor data subjek | `format` |
| `ACCOUNT_DELETED` | Permintaan/selesainya hapus akun | `stage` |

Jangan masukkan nama, telepon, email, nilai disabilitas, kebutuhan akomodasi, token, atau nilai field sensitif lain ke `meta`. Katalog dipetakan pada PR modul terkait; baca massal dicatat per-job, bukan per-record.
