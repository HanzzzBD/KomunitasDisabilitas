import type { KatalogFitur } from "../tipe.js";

export const katalogResume = {
  "resume.daftar.judul": { id: "CV saya", "id-simple": "Daftar CV saya" },
  "resume.daftar.deskripsi": {
    id: "Buat CV lewat obrolan dengan pewawancara AI, atau dari data profil Anda. Keduanya bisa diubah sebelum dipakai.",
    "id-simple":
      "Pilih cara buat CV: ngobrol dengan AI, atau salin dari profil. Keduanya masih bisa diubah.",
  },
  "resume.daftar.buat": { id: "Buat CV dari profil", "id-simple": "Buat CV memakai profil" },
  "resume.daftar.membuat": { id: "Membuat CV…", "id-simple": "CV sedang dibuat…" },
  "resume.daftar.memuat": { id: "Memuat daftar CV…", "id-simple": "Daftar CV sedang dibuka…" },
  "resume.daftar.judulBawaan": { id: "CV Saya", "id-simple": "CV Baru Saya" },
  "resume.daftar.kosongJudul": { id: "Belum ada CV", "id-simple": "Anda belum punya CV" },
  "resume.daftar.kosongDeskripsi": {
    id: "Buat CV pertama Anda dari data profil yang sudah tersimpan.",
    "id-simple": "Tekan tombol buat. Isi profil Anda akan disalin ke CV.",
  },
  "resume.daftar.ubah": { id: "Buka editor", "id-simple": "Ubah CV" },
  "resume.daftar.hapusLabel": {
    id: "Hapus CV {judul}",
    "id-simple": "Hapus {judul} dari daftar CV",
  },
  "resume.daftar.diperbarui": {
    id: "Diperbarui {tanggal}",
    "id-simple": "Terakhir diubah {tanggal}",
  },

  "resume.editor.judul": { id: "Editor CV", "id-simple": "Ubah CV" },
  "resume.editor.deskripsi": {
    id: "Buka satu bagian, ubah isinya, lalu simpan bagian tersebut. Bagian lain tidak akan hilang jika penyimpanan gagal.",
    "id-simple":
      "Ubah dan simpan satu bagian setiap kali. Bagian lain tetap aman bila ada masalah.",
  },
  "resume.editor.kembali": { id: "Kembali ke daftar CV", "id-simple": "Kembali ke semua CV" },
  // PR-078 — CV dibuat dari dialog lamar; tautan ini membuka dialognya lagi.
  "resume.kembaliMelamar": {
    id: "Kembali melamar lowongan",
    "id-simple": "Kembali dan lamar",
  },
  "resume.pdf.status.memeriksa": { id: "Memeriksa PDF...", "id-simple": "Sedang memeriksa PDF..." },
  "resume.pdf.bagian": { id: "PDF CV", "id-simple": "Unduh CV sebagai PDF" },
  "resume.pdf.status.idle": { id: "PDF belum dibuat.", "id-simple": "PDF belum siap." },
  "resume.pdf.status.queued": {
    id: "PDF masuk antrean.",
    "id-simple": "PDF sedang menunggu dibuat.",
  },
  "resume.pdf.status.processing": {
    id: "PDF sedang dibuat.",
    "id-simple": "Sistem sedang membuat PDF.",
  },
  "resume.pdf.status.ready": {
    id: "PDF siap diunduh.",
    "id-simple": "PDF sudah siap diunduh.",
  },
  "resume.pdf.status.failed": {
    id: "PDF belum berhasil dibuat. Anda dapat mencoba lagi.",
    "id-simple": "PDF gagal dibuat. Coba lagi.",
  },
  "resume.pdf.status.gagalJaringan": {
    id: "Status PDF belum dapat diperiksa. Periksa internet Anda, lalu coba lagi.",
    "id-simple": "Internet bermasalah. Status PDF belum diketahui. Coba lagi.",
  },
  "resume.pdf.aksi.siapkan": { id: "Siapkan PDF", "id-simple": "Buat PDF" },
  "resume.pdf.aksi.meminta": { id: "Meminta PDF...", "id-simple": "PDF sedang diminta..." },
  "resume.pdf.aksi.menunggu": { id: "Menunggu PDF", "id-simple": "PDF sedang dibuat" },
  "resume.pdf.aksi.unduh": { id: "Unduh PDF", "id-simple": "Unduh PDF sekarang" },
  "resume.pdf.aksi.menyiapkanUnduh": {
    id: "Menyiapkan unduhan...",
    "id-simple": "Menyiapkan PDF...",
  },
  "resume.pdf.aksi.cobaRenderLagi": { id: "Coba buat PDF lagi", "id-simple": "Coba lagi" },
  "resume.editor.memuat": { id: "Memuat isi CV…", "id-simple": "Isi CV sedang dibuka…" },

  "resume.bagian.judul": { id: "Nama CV", "id-simple": "Nama dokumen CV" },
  "resume.bagian.tentang": { id: "Profil singkat", "id-simple": "Tentang diri Anda" },
  "resume.bagian.kontak": { id: "Kontak", "id-simple": "Cara menghubungi Anda" },
  "resume.bagian.tautan": { id: "Tautan profesional", "id-simple": "Tautan kerja Anda" },
  "resume.bagian.pengalaman": { id: "Pengalaman kerja", "id-simple": "Riwayat pekerjaan" },
  "resume.bagian.pendidikan": { id: "Pendidikan", "id-simple": "Riwayat sekolah" },
  "resume.bagian.keahlian": { id: "Keahlian", "id-simple": "Kemampuan Anda" },
  "resume.bagian.sertifikasi": {
    id: "Sertifikasi dan pelatihan",
    "id-simple": "Sertifikat dan latihan",
  },
  "resume.bagian.organisasi": {
    id: "Organisasi dan kerelawanan",
    "id-simple": "Kegiatan organisasi",
  },

  "resume.kolom.judulCv": { id: "Judul CV", "id-simple": "Nama CV" },
  "resume.kolom.headline": {
    id: "Headline profesional",
    "id-simple": "Judul singkat tentang Anda",
  },
  "resume.kolom.ringkasan": {
    id: "Ringkasan profesional",
    "id-simple": "Cerita singkat tentang kemampuan Anda",
  },
  "resume.kolom.email": { id: "Alamat email", "id-simple": "Email untuk dihubungi" },
  "resume.kolom.telepon": { id: "Nomor telepon", "id-simple": "Nomor HP" },
  "resume.kolom.kota": { id: "Kota domisili", "id-simple": "Kota tempat tinggal" },
  "resume.kolom.provinsi": { id: "Provinsi domisili", "id-simple": "Provinsi tempat tinggal" },
  "resume.kolom.namaTautan": { id: "Nama tautan", "id-simple": "Nama situs" },
  "resume.kolom.alamatTautan": { id: "Alamat tautan", "id-simple": "Alamat situs lengkap" },
  "resume.kolom.posisi": { id: "Nama posisi", "id-simple": "Pekerjaan Anda" },
  "resume.kolom.perusahaan": { id: "Nama perusahaan", "id-simple": "Tempat Anda bekerja" },
  "resume.kolom.mulai": { id: "Tanggal mulai", "id-simple": "Mulai kapan" },
  "resume.kolom.selesai": { id: "Tanggal selesai", "id-simple": "Selesai kapan" },
  "resume.kolom.uraian": { id: "Uraian pekerjaan", "id-simple": "Apa yang Anda kerjakan" },
  "resume.kolom.institusi": { id: "Nama institusi", "id-simple": "Nama sekolah atau kampus" },
  "resume.kolom.jenjang": { id: "Jenjang pendidikan", "id-simple": "Tingkat sekolah" },
  "resume.kolom.bidang": { id: "Bidang studi", "id-simple": "Jurusan" },
  "resume.kolom.tahun": { id: "Tahun lulus", "id-simple": "Lulus tahun berapa" },
  "resume.kolom.keahlian": { id: "Nama keahlian", "id-simple": "Kemampuan" },
  "resume.kolom.tingkat": { id: "Tingkat keahlian", "id-simple": "Seberapa mahir" },
  "resume.kolom.sertifikat": {
    id: "Nama sertifikat atau pelatihan",
    "id-simple": "Sertifikat atau latihan",
  },
  "resume.kolom.penerbit": { id: "Lembaga penerbit", "id-simple": "Yang memberi sertifikat" },
  "resume.kolom.tahunTerbit": { id: "Tahun diterbitkan", "id-simple": "Didapat tahun berapa" },
  "resume.kolom.organisasi": { id: "Nama organisasi", "id-simple": "Organisasi yang diikuti" },
  "resume.kolom.peran": { id: "Peran", "id-simple": "Tugas Anda" },
  "resume.kolom.uraianOrganisasi": { id: "Uraian kegiatan", "id-simple": "Apa yang Anda lakukan" },

  "resume.bantuan.tanggal": {
    id: "Gunakan format YYYY-MM-DD, contoh 2024-03-01.",
    "id-simple": "Tulis tahun-bulan-tanggal. Contoh: 2024-03-01.",
  },
  "resume.bantuan.selesai": {
    id: "Kosongkan bila masih berlangsung. Gunakan format YYYY-MM-DD.",
    "id-simple": "Kosongkan jika masih dijalani. Contoh tanggal: 2024-03-01.",
  },
  "resume.bantuan.tautan": {
    id: "Awali dengan https:// atau http://.",
    "id-simple": "Tulis alamat lengkap yang dimulai dengan https:// atau http://.",
  },

  "resume.aksi.simpanBagian": { id: "Simpan bagian", "id-simple": "Simpan bagian ini" },
  "resume.aksi.menyimpan": { id: "Menyimpan…", "id-simple": "Sedang menyimpan…" },
  "resume.aksi.cobaLagi": { id: "Coba lagi", "id-simple": "Ulangi" },
  "resume.aksi.hapus": { id: "Hapus", "id-simple": "Buang" },
  "resume.aksi.naik": { id: "Pindah ke atas", "id-simple": "Naikkan" },
  "resume.aksi.turun": { id: "Pindah ke bawah", "id-simple": "Turunkan" },
  "resume.aksi.tambahTautan": { id: "Tambah tautan", "id-simple": "Tambah alamat situs" },
  "resume.aksi.tambahPengalaman": {
    id: "Tambah pengalaman kerja",
    "id-simple": "Tambah pekerjaan",
  },
  "resume.aksi.tambahPendidikan": { id: "Tambah pendidikan", "id-simple": "Tambah sekolah" },
  "resume.aksi.tambahKeahlian": { id: "Tambah keahlian", "id-simple": "Tambah kemampuan" },
  "resume.aksi.tambahSertifikat": { id: "Tambah sertifikat", "id-simple": "Tambah bukti latihan" },
  "resume.aksi.tambahOrganisasi": { id: "Tambah organisasi", "id-simple": "Tambah kegiatan" },

  "resume.kosong.tautan": {
    id: "Belum ada tautan profesional.",
    "id-simple": "Anda belum menambah alamat situs.",
  },
  "resume.kosong.pengalaman": {
    id: "Belum ada pengalaman kerja.",
    "id-simple": "Anda belum menambah pekerjaan.",
  },
  "resume.kosong.pendidikan": {
    id: "Belum ada riwayat pendidikan.",
    "id-simple": "Anda belum menambah sekolah.",
  },
  "resume.kosong.keahlian": {
    id: "Belum ada keahlian.",
    "id-simple": "Anda belum menambah kemampuan.",
  },
  "resume.kosong.sertifikasi": {
    id: "Belum ada sertifikasi atau pelatihan.",
    "id-simple": "Anda belum menambah sertifikat.",
  },
  "resume.kosong.organisasi": {
    id: "Belum ada pengalaman organisasi.",
    "id-simple": "Anda belum menambah kegiatan organisasi.",
  },

  "resume.satuan.tautan": { id: "tautan", "id-simple": "alamat situs" },
  "resume.satuan.pengalaman": { id: "pengalaman kerja", "id-simple": "pekerjaan" },
  "resume.satuan.pendidikan": { id: "pendidikan", "id-simple": "sekolah" },
  "resume.satuan.keahlian": { id: "keahlian", "id-simple": "kemampuan" },
  "resume.satuan.sertifikat": { id: "sertifikat", "id-simple": "bukti latihan" },
  "resume.satuan.organisasi": { id: "organisasi", "id-simple": "kegiatan" },
  "resume.item.nomor": { id: "{nama} {nomor}", "id-simple": "Nomor {nomor}: {nama}" },
  "resume.item.tautan": { id: "Tautan {nomor}", "id-simple": "Alamat situs nomor {nomor}" },
  "resume.status.tersimpan": {
    id: "Bagian {bagian} sudah disimpan.",
    "id-simple": "{bagian} sudah aman tersimpan.",
  },
  "resume.status.dihapus": {
    id: "Item {nomor} dihapus dari draf.",
    "id-simple": "Nomor {nomor} sudah dibuang dari draf.",
  },
  "resume.status.dipindah": {
    id: "Item {dari} dipindahkan ke posisi {ke}.",
    "id-simple": "Nomor {dari} sekarang berada di urutan {ke}.",
  },

  "resume.galat.periksaKolom": {
    id: "Periksa kembali kolom yang ditandai.",
    "id-simple": "Ada isian yang perlu diperbaiki.",
  },
  "resume.galat.jaringan": {
    id: "CV belum dapat disimpan. Periksa internet Anda, lalu coba lagi.",
    "id-simple": "Internet bermasalah. CV belum tersimpan. Coba lagi nanti.",
  },
  "resume.galat.batas": {
    id: "Anda sudah mencapai batas jumlah CV.",
    "id-simple": "Jumlah CV Anda sudah penuh. Hapus satu CV sebelum membuat yang baru.",
  },

  // --- AI CV Builder (PR-068) ---
  "resume.daftar.buatChat": {
    id: "Buat dengan chat AI",
    "id-simple": "Buat CV sambil ngobrol dengan AI",
  },
  "resume.chat.judul": { id: "Buat CV lewat obrolan", "id-simple": "Buat CV sambil ngobrol" },
  "resume.chat.deskripsi": {
    id: "Pewawancara AI akan menanyakan riwayat kerja dan pendidikan Anda satu per satu. Jawaban Anda disusun menjadi draft CV yang bisa Anda periksa dan ubah.",
    "id-simple":
      "AI akan bertanya satu hal setiap kali. Anda cukup menjawab. Nanti jawaban Anda jadi draft CV. Anda tetap bisa mengubahnya.",
  },
  "resume.chat.memuat": { id: "Membuka percakapan…", "id-simple": "Percakapan sedang dibuka…" },
  "resume.chat.kembali": { id: "Kembali ke daftar CV", "id-simple": "Kembali ke semua CV" },
  "resume.chat.transkripLabel": { id: "Percakapan", "id-simple": "Isi obrolan" },
  "resume.chat.pewawancara": { id: "Pewawancara", "id-simple": "AI" },
  "resume.chat.anda": { id: "Anda", "id-simple": "Saya" },
  "resume.chat.mengetik": {
    id: "Pewawancara sedang mengetik…",
    "id-simple": "AI sedang menulis jawaban…",
  },
  "resume.chat.menyambung": {
    id: "Sambungan terputus. Menyambung kembali…",
    "id-simple": "Internet terputus. Sedang mencoba lagi…",
  },
  "resume.chat.labelPesan": { id: "Jawaban Anda", "id-simple": "Tulis jawaban Anda" },
  "resume.chat.bantuanPesan": {
    id: "Paling banyak {maks} karakter. Tekan Ctrl+Enter untuk mengirim.",
    "id-simple": "Tulis paling banyak {maks} huruf. Kirim dengan Ctrl dan Enter.",
  },
  "resume.chat.kirim": { id: "Kirim", "id-simple": "Kirim jawaban" },
  "resume.chat.mengirim": { id: "Mengirim…", "id-simple": "Sedang dikirim…" },
  "resume.chat.kuota": {
    id: "Sisa pesan hari ini: {sisa} dari {batas}. Sisa pembuatan draft: {sisaDraft}.",
    "id-simple": "Hari ini Anda masih bisa kirim {sisa} pesan dan buat {sisaDraft} draft.",
  },
  "resume.chat.finalisasi": {
    id: "Selesai dan buat draf CV",
    "id-simple": "Selesai, jadikan CV",
  },
  "resume.chat.finalisasiMemproses": {
    id: "Draft CV sedang dibuat dari percakapan Anda. Biasanya kurang dari satu menit.",
    "id-simple": "Draft CV sedang dibuat. Tunggu sebentar.",
  },
  "resume.chat.finalisasiSelesai": {
    id: "Draft CV Anda siap. Periksa dan ubah isinya sebelum dipakai melamar.",
    "id-simple": "Draft CV sudah jadi. Cek isinya dulu sebelum melamar.",
  },
  "resume.chat.bukaDraft": { id: "Buka draft CV", "id-simple": "Lihat draft CV" },
  "resume.chat.draftTerhapus": {
    id: "Draft dari percakapan ini sudah dihapus.",
    "id-simple": "Draft ini sudah Anda hapus.",
  },
  "resume.chat.finalisasiGagal": {
    id: "Draft CV belum berhasil dibuat. Jawaban Anda tetap tersimpan — coba lagi, atau isi CV lewat formulir.",
    "id-simple": "Draft CV belum jadi. Jawaban Anda aman. Coba lagi, atau isi formulir.",
  },
  "resume.chat.cobaFinalisasi": { id: "Coba buat draft lagi", "id-simple": "Coba lagi" },
  "resume.chat.mulaiBaru": {
    id: "Mulai percakapan baru",
    "id-simple": "Ngobrol lagi dari awal",
  },
  "resume.chat.modeFormulirJudul": {
    id: "Chat AI sedang tidak bisa dipakai",
    "id-simple": "AI sedang tidak bisa dipakai",
  },
  "resume.chat.modeFormulir": {
    id: "Anda tetap bisa membuat CV lewat formulir biasa. Percakapan di bawah tetap tersimpan dan bisa Anda salin.",
    "id-simple": "Anda tetap bisa buat CV lewat formulir. Obrolan di bawah tidak hilang.",
  },
  "resume.chat.kuotaKembali": {
    id: "Jatah chat dibuka lagi dalam sekitar {jam} jam.",
    "id-simple": "Chat bisa dipakai lagi kira-kira {jam} jam lagi.",
  },
  "resume.chat.isiFormulir": { id: "Isi CV lewat formulir", "id-simple": "Pakai formulir" },
  "resume.chat.membuatFormulir": {
    id: "Menyiapkan formulir…",
    "id-simple": "Formulir sedang disiapkan…",
  },
} as const satisfies KatalogFitur;
