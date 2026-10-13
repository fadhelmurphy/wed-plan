# Rencana Nikah

Cari gedung pernikahan terdekat, lihat vendor, dan hitung anggaran. Situs statis, tanpa build.

## Deploy
1. Push isi folder ini ke branch `main`.
2. Settings > Pages > Source: **GitHub Actions**.
3. Alamat: `https://<username>.github.io/<nama-repo>/`.

## Pembaruan bulanan
Workflow `pages.yml` jalan otomatis tanggal 1 tiap bulan (09:00 WIB), atau manual lewat tab Actions > Run workflow.
Skrip `scripts/update.mjs` memperbarui `data/data.json`, lalu situs dideploy ulang. Commit dibuat oleh `github-actions[bot]`.

| Data | Sumber | Otomatis |
|---|---|---|
| Harga emas Antam | logammulia.com | ya; jika gagal memakai `data/manual.json`, lalu nilai bulan lalu |
| Venue tambahan | OpenStreetMap (Overpass) | ya, tanpa harga |
| Harga paket gedung, vendor | `data/curated.json` | tidak, isi manual |
| Faktor kenaikan harga | 4,5% per tahun, dihitung di browser | ya, naik tiap bulan |

Jika emas otomatis gagal terus, buat `data/manual.json`:
```json
{ "goldPrice": 2700000, "goldAsOf": "1 November 2026" }
```
Ubah harga paket gedung dan vendor langsung di `data/curated.json`, lalu push.
`data/data.json` dibuat ulang oleh skrip, jangan diedit tangan.
