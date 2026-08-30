import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { saveAs } from "file-saver";
import sealUrl from "./official-seal.png";

const PRIMARY_RGB = [15, 61, 62]; // #0F3D3E
const MARGIN = 48;
const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  const contentType = res.headers.get("content-type") || "";
  const buf = await res.arrayBuffer();
  return { buf, contentType };
}

function guessKind(fileName, contentType) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (ext === "pdf" || contentType.includes("pdf")) return "pdf";
  if (["jpg", "jpeg"].includes(ext) || contentType.includes("jpeg")) return "jpg";
  if (ext === "png" || contentType.includes("png")) return "png";
  return "other";
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---------- Bangun bagian notulen sebagai halaman PDF (jsPDF) ----------
async function buildNotulenPdf(meeting) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = MARGIN;

  // Kop surat
  const LOGO_W = 85;
  const LOGO_H = 122;
  try {
    const { buf } = await fetchBuffer(sealUrl);
    const b64 = arrayBufferToBase64(buf);
    doc.addImage(`data:image/png;base64,${b64}`, "PNG", MARGIN, y, LOGO_W, LOGO_H);
  } catch (e) {
    // lanjut tanpa logo kalau gagal dimuat
  }

  const textX = MARGIN + LOGO_W + 15;
  const textW = CONTENT_W - LOGO_W - 15;
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  const lines1 = ["MAHKAMAH AGUNG REPUBLIK INDONESIA", "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA", "PENGADILAN TINGGI AGAMA SEMARANG", "PENGADILAN AGAMA PURWOKERTO"];
  let ty = y + 24;
  lines1.forEach((l) => {
    doc.text(l, textX + textW / 2, ty, { align: "center" });
    ty += 16;
  });
  doc.setFont("times", "bold");
  doc.setFontSize(9.5);
  doc.text("JL. Gerilya NO. 7A Purwokerto \u2013 53143 TELP. 0281-636366 FAX. 0281-643289", textX + textW / 2, ty, { align: "center" });
  ty += 13;
  doc.setTextColor(17, 85, 204);
  doc.text("website : http://www.pa-purwokerto.go.id   email : pa.purwokerto@gmail.com", textX + textW / 2, ty, { align: "center" });
  doc.setTextColor(0, 0, 0);
  ty += 10;

  y = Math.max(y + LOGO_H + 8, ty + 8);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 24;

  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text("NOTULEN RAPAT", PAGE_W / 2, y, { align: "center" });
  const titleWidth = doc.getTextWidth("NOTULEN RAPAT");
  doc.setLineWidth(1);
  doc.line(PAGE_W / 2 - titleWidth / 2, y + 3, PAGE_W / 2 + titleWidth / 2, y + 3);
  y += 28;

  // Info fields (label rata kiri, nilai mulai di posisi tetap)
  const labelX = MARGIN;
  const valueX = MARGIN + 118;
  const fields = [
    ["Judul Rapat", meeting.title || "-"],
    ["Tanggal", formatDate(meeting.date)],
    ["Pemimpin Rapat", meeting.leader || "-"],
    ["Kategori", meeting.category || "-"],
    ["Jumlah Hadir", meeting.attendees?.length ? `${meeting.attendees.length} orang` : "-"],
  ];
  doc.setFontSize(11);
  fields.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label} :`, labelX, y);
    doc.setFont("helvetica", "normal");
    const valueLines = doc.splitTextToSize(value, PAGE_W - MARGIN - valueX);
    doc.text(valueLines, valueX, y);
    y += 16 * valueLines.length;
  });
  y += 10;

  function ensureSpace(need) {
    if (y + need > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function sectionHeading(text) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...PRIMARY_RGB);
    doc.text(text, MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 18;
  }

  function bodyText(text) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const clean = text && text.trim() ? text : "-";
    const wrapped = doc.splitTextToSize(clean, CONTENT_W);
    wrapped.forEach((line) => {
      ensureSpace(16);
      doc.text(line, MARGIN, y);
      y += 15;
    });
    y += 8;
  }

  sectionHeading("Agenda");
  bodyText(meeting.agenda);

  sectionHeading("Pembahasan");
  bodyText(meeting.discussion);

  sectionHeading("Daftar Hadir");
  if (meeting.attendees && meeting.attendees.length > 0) {
    ensureSpace(40);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["No", "Nama", "Jabatan / Unit"]],
      body: meeting.attendees.map((a, i) => [String(i + 1), a.name || "-", a.position || "-"]),
      styles: { font: "helvetica", fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: PRIMARY_RGB, textColor: 255, fontStyle: "bold" },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    bodyText("-");
  }

  // Tanda tangan
  ensureSpace(120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const todayStr = formatDate(new Date().toISOString().slice(0, 10));
  doc.text(`Purwokerto, ${todayStr}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 16;
  doc.text("Notulis,", PAGE_W - MARGIN, y, { align: "right" });
  y += 60;
  doc.text("( ______________________ )", PAGE_W - MARGIN, y, { align: "right" });

  return doc.output("arraybuffer");
}

function drawDividerPage(pdfDoc, font, title) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0.06, 0.24, 0.24) });
  const size = 22;
  const textWidth = font.widthOfTextAtSize(title, size);
  page.drawText(title, {
    x: (PAGE_W - textWidth) / 2,
    y: PAGE_H / 2,
    size,
    font,
    color: rgb(1, 1, 1),
  });
}

async function addImagePage(pdfDoc, buf, kind, caption, font) {
  const image = kind === "png" ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const maxW = PAGE_W - MARGIN * 2;
  const maxH = PAGE_H - MARGIN * 2 - 24;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: (PAGE_W - w) / 2,
    y: (PAGE_H - h) / 2 + 12,
    width: w,
    height: h,
  });
  if (caption) {
    const size = 9;
    const textWidth = font.widthOfTextAtSize(caption, size);
    page.drawText(caption, {
      x: Math.max(MARGIN, (PAGE_W - textWidth) / 2),
      y: MARGIN / 2,
      size,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
}

function addPlaceholderPage(pdfDoc, font, fileName) {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const title = "Lampiran tidak dapat digabungkan otomatis";
  page.drawText(title, { x: MARGIN, y: PAGE_H - MARGIN - 20, size: 13, font, color: rgb(0.7, 0.1, 0.1) });
  page.drawText(`Nama berkas: ${fileName || "-"}`, { x: MARGIN, y: PAGE_H - MARGIN - 48, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Format berkas ini bukan PDF/gambar sehingga tidak bisa disatukan ke", { x: MARGIN, y: PAGE_H - MARGIN - 70, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  page.drawText("dalam PDF ini. Unduh berkas aslinya lewat tombol \u201CUnduh Semua (ZIP)\u201D.", { x: MARGIN, y: PAGE_H - MARGIN - 86, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
}

export async function exportMeetingToCombinedPdf(meeting, { onProgress } = {}) {
  const report = (msg) => onProgress && onProgress(msg);

  report("Menyusun notulen...");
  const notulenBuffer = await buildNotulenPdf(meeting);

  const combined = await PDFDocument.create();
  const font = await combined.embedFont(StandardFonts.Helvetica);
  const fontBold = await combined.embedFont(StandardFonts.HelveticaBold);

  const notulenDoc = await PDFDocument.load(notulenBuffer);
  const notulenPages = await combined.copyPages(notulenDoc, notulenDoc.getPageIndices());
  notulenPages.forEach((p) => combined.addPage(p));

  let skipped = 0;

  if (meeting.documents && meeting.documents.length > 0) {
    report("Menggabungkan dokumentasi...");
    drawDividerPage(combined, fontBold, "DOKUMENTASI RAPAT");
    for (const d of meeting.documents) {
      try {
        const { buf, contentType } = await fetchBuffer(d.url);
        const kind = guessKind(d.fileName, contentType);
        if (kind === "png" || kind === "jpg") {
          await addImagePage(combined, buf, kind, d.fileName, font);
        } else {
          addPlaceholderPage(combined, font, d.fileName);
          skipped++;
        }
      } catch (e) {
        skipped++;
      }
    }
  }

  if (meeting.attachments && meeting.attachments.length > 0) {
    report("Menggabungkan lampiran...");
    drawDividerPage(combined, fontBold, "LAMPIRAN RAPAT");
    for (const a of meeting.attachments) {
      try {
        const { buf, contentType } = await fetchBuffer(a.url);
        const kind = guessKind(a.fileName, contentType);
        if (kind === "pdf") {
          const attDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
          const pages = await combined.copyPages(attDoc, attDoc.getPageIndices());
          pages.forEach((p) => combined.addPage(p));
        } else if (kind === "png" || kind === "jpg") {
          await addImagePage(combined, buf, kind, a.fileName, font);
        } else {
          addPlaceholderPage(combined, font, a.fileName);
          skipped++;
        }
      } catch (e) {
        addPlaceholderPage(combined, font, a.fileName);
        skipped++;
      }
    }
  }

  report("Menyimpan berkas...");
  const bytes = await combined.save();
  saveAs(new Blob([bytes], { type: "application/pdf" }), `Notulen Lengkap - ${meeting.title || "rapat"}.pdf`);

  return { skipped };
}
