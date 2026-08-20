import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  ShadingType,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import logoUrl from "../logo.png";

const NAVY = "17365D";
const GOLD = "B8912B";

async function fetchLogoBuffer() {
  try {
    const res = await fetch(logoUrl);
    return await res.arrayBuffer();
  } catch (e) {
    return null;
  }
}

const statusLabel = { belum: "Belum", proses: "Proses", selesai: "Selesai" };

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Kop surat resmi dengan logo NOTEA di kiri dan teks instansi rata tengah,
// diikuti garis pembatas emas seperti kop surat instansi pemerintah.
async function buildLetterhead() {
  const logoBuffer = await fetchLogoBuffer();

  const logoParagraph = logoBuffer
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 70, height: 70 },
            type: "png",
          }),
        ],
      })
    : new Paragraph({ children: [new TextRun({ text: "" })] });

  return [
    logoParagraph,
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "MAHKAMAH AGUNG REPUBLIK INDONESIA", bold: true, size: 24, color: NAVY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "PENGADILAN AGAMA PURWOKERTO", bold: true, size: 32, color: NAVY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Jl. [alamat kantor], Purwokerto, Kabupaten Banyumas, Jawa Tengah — Telp. [nomor] — Website: pa-purwokerto.go.id",
          size: 16,
          italics: true,
          color: "555555",
        }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD },
      },
      spacing: { after: 200 },
      children: [new TextRun({ text: "" })],
    }),
  ];
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 22 })],
  });
}

function bodyParagraph(text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: text && text.trim() ? text : "-", size: 22 })],
  });
}

function infoRow(label, value) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${label.padEnd(16, " ")}`, bold: true, size: 22 }),
      new TextRun({ text: `: ${value || "-"}`, size: 22 }),
    ],
  });
}

function actionItemsTable(items) {
  if (!items || items.length === 0) {
    return new Paragraph({ children: [new TextRun({ text: "-", size: 22 })] });
  }

  const headerCells = ["No", "Tugas / Tindak Lanjut", "PIC", "Deadline", "Status"].map(
    (text) =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: NAVY, fill: NAVY },
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })],
          }),
        ],
      })
  );

  const rows = [new TableRow({ children: headerCells, tableHeader: true })];

  items.forEach((item, idx) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.task || "-", size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.owner || "-", size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatDate(item.deadline), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: statusLabel[item.status] || item.status, size: 20 })] })] }),
        ],
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

export async function exportMeetingToDocx(meeting) {
  const letterhead = await buildLetterhead();
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...letterhead,
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "NOTULEN RAPAT", bold: true, size: 28, underline: {} })],
          }),
          infoRow("Judul Rapat", meeting.title),
          infoRow("Tanggal", formatDate(meeting.date)),
          infoRow("Pemimpin Rapat", meeting.leader),
          infoRow("Peserta", meeting.participants),

          sectionHeading("Agenda"),
          bodyParagraph(meeting.agenda),

          sectionHeading("Pembahasan"),
          bodyParagraph(meeting.discussion),

          sectionHeading("Keputusan"),
          bodyParagraph(meeting.decisions),

          sectionHeading("Action Item"),
          actionItemsTable(meeting.actionItems),

          new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "" })] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `Purwokerto, ${formatDate(new Date().toISOString().slice(0, 10))}`, size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 800 },
            children: [new TextRun({ text: "Notulis,", size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "( ______________________ )", size: 22 })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Notulen - ${meeting.title || "rapat"}.docx`);
}
