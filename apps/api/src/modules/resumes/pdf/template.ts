import type { ResumeContent } from "@nawasena/schemas";

const BULAN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

/** Escape teks DAN atribut; tidak ada user string yang masuk template tanpa ini. */
export function escapeResumeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tanggal(value: string | null): string | null {
  if (value === null) return null;
  const [year, month] = value.split("-");
  const index = Number(month) - 1;
  return `${BULAN[index] ?? month} ${year ?? ""}`.trim();
}

function periode(start: string | null, end: string | null): string | null {
  const awal = tanggal(start);
  if (awal === null && end === null) return null;
  return `${awal ?? ""} – ${tanggal(end) ?? "Sekarang"}`.trim();
}

function metadata(values: Array<string | number | null | undefined>): string {
  const isi = values.filter(
    (value): value is string | number => value !== null && value !== undefined,
  );
  return isi.length === 0
    ? ""
    : `<p class="meta">${isi.map(String).map(escapeResumeHtml).join(" · ")}</p>`;
}

function deskripsi(value: string | null): string {
  return value === null ? "" : `<p class="description">${escapeResumeHtml(value)}</p>`;
}

function section(id: string, title: string, body: string): string {
  if (body === "") return "";
  return `<section aria-labelledby="${id}"><h2 id="${id}">${title}</h2>${body}</section>`;
}

function kontak(content: ResumeContent): string {
  const { contact } = content;
  const baris: string[] = [];
  if (contact.email !== null) {
    baris.push(
      `<a href="mailto:${encodeURIComponent(contact.email)}">${escapeResumeHtml(contact.email)}</a>`,
    );
  }
  if (contact.phone !== null) {
    const tel = contact.phone.replace(/[^+0-9]/g, "");
    baris.push(`<a href="tel:${escapeResumeHtml(tel)}">${escapeResumeHtml(contact.phone)}</a>`);
  }
  const lokasi = [contact.city, contact.province].filter((v): v is string => v !== null).join(", ");
  if (lokasi !== "") baris.push(`<span>${escapeResumeHtml(lokasi)}</span>`);
  for (const link of contact.links) {
    baris.push(`<a href="${escapeResumeHtml(link.url)}">${escapeResumeHtml(link.label)}</a>`);
  }
  return baris.length === 0
    ? ""
    : `<address>${baris.join('<span aria-hidden="true"> • </span>')}</address>`;
}

/** HTML satu kolom, ATS-friendly, dengan urutan DOM yang sama dengan urutan baca. */
export function renderResumeHtml(title: string, content: ResumeContent): string {
  const experiences = content.experiences
    .map(
      (item) =>
        `<article><h3>${escapeResumeHtml(item.title)}</h3>${metadata([
          item.company,
          periode(item.startDate, item.endDate),
        ])}${deskripsi(item.description)}</article>`,
    )
    .join("");
  const educations = content.educations
    .map(
      (item) =>
        `<article><h3>${escapeResumeHtml(item.institution)}</h3>${metadata([
          item.degree,
          item.field,
          item.year,
        ])}</article>`,
    )
    .join("");
  const skills =
    content.skills.length === 0
      ? ""
      : `<ul class="compact">${content.skills
          .map(
            (item) =>
              `<li><strong>${escapeResumeHtml(item.name)}</strong>${
                item.level === null ? "" : ` — ${escapeResumeHtml(item.level)}`
              }</li>`,
          )
          .join("")}</ul>`;
  const certifications = content.certifications
    .map(
      (item) =>
        `<article><h3>${escapeResumeHtml(item.name)}</h3>${metadata([
          item.issuer,
          item.year,
        ])}</article>`,
    )
    .join("");
  const organizations = content.organizations
    .map(
      (item) =>
        `<article><h3>${escapeResumeHtml(item.name)}</h3>${metadata([
          item.role,
          periode(item.startDate, item.endDate),
        ])}${deskripsi(item.description)}</article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeResumeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 17mm 18mm; }
    * { box-sizing: border-box; }
    html { color: #171717; background: #fff; font-family: Arial, "Noto Sans", "Noto Color Emoji", sans-serif; font-size: 10.5pt; line-height: 1.45; }
    body { margin: 0; }
    main { max-width: 100%; }
    header { border-bottom: 2px solid #171717; padding-bottom: 10px; }
    h1 { margin: 0; font-size: 24pt; line-height: 1.15; overflow-wrap: anywhere; }
    .headline { margin: 5px 0 0; font-size: 12pt; font-weight: 700; }
    address { display: flex; flex-wrap: wrap; gap: 2px 7px; margin-top: 8px; font-style: normal; overflow-wrap: anywhere; }
    a { color: #171717; text-decoration: underline; }
    section { margin-top: 15px; }
    h2 { margin: 0 0 7px; border-bottom: 1px solid #777; padding-bottom: 2px; font-size: 13pt; text-transform: uppercase; letter-spacing: .03em; }
    article { break-inside: avoid; margin: 0 0 10px; }
    h3 { margin: 0; font-size: 11pt; line-height: 1.3; }
    p { margin: 4px 0 0; }
    .meta { color: #404040; }
    .description, .summary { white-space: pre-wrap; overflow-wrap: anywhere; }
    ul { margin: 4px 0 0; padding-left: 20px; }
    .compact { columns: 2; column-gap: 28px; }
    .compact li { break-inside: avoid; margin-bottom: 3px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeResumeHtml(title)}</h1>
      ${content.headline === null ? "" : `<p class="headline">${escapeResumeHtml(content.headline)}</p>`}
      ${kontak(content)}
    </header>
    ${section("ringkasan", "Ringkasan", content.summary === null ? "" : `<p class="summary">${escapeResumeHtml(content.summary)}</p>`)}
    ${section("pengalaman", "Pengalaman kerja", experiences)}
    ${section("pendidikan", "Pendidikan", educations)}
    ${section("keahlian", "Keahlian", skills)}
    ${section("sertifikasi", "Sertifikasi dan pelatihan", certifications)}
    ${section("organisasi", "Organisasi dan kerelawanan", organizations)}
  </main>
</body>
</html>`;
}
