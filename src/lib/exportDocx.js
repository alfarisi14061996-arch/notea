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
  ExternalHyperlink,
} from "docx";
import { saveAs } from "file-saver";
import logoUrl from "../logo.png";

const PRIMARY = "0F3D3E";
const ACCENT = "2E7D4F";

async function fetchLogoBuffer() {
  try {
    const res = await fetch(logoUrl);
    return await res.arrayBuffer();
  } catch (e) {
    return null;
  }
}

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
        new TextRun({ text: "MAHKAMAH AGUNG REPUBLIK INDONESIA", bold: true, size: 24, color: PRIMARY }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "PENGADILAN AGAMA PURWOKERTO", bold: true, size: 32, color: PRIMARY }),
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
        bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT },
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
    children: [new TextRun({ text, bold: true, color: PRIMARY, size: 22 })],
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

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url);
    return await res.arrayBuffer();
  } catch (e) {
    return null;
  }
}

function inferImageType(fileName) {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "gif") return "gif";
  if (ext === "bmp") return "bmp";
  return "jpg";
}

function attendeesTable(attendees) {
  if (!attendees || attendees.length === 0) {
    return new Paragraph({ children: [new TextRun({ text: "-", size: 22 })] });
  }

  const headerCells = ["No", "Nama", "Jabatan / Unit", "Tanda Tangan"].map(
    (text) =>
      new TableCell({
        shading: { type: ShadingType.SOLID, color: PRIMARY, fill: PRIMARY },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })] })],
      })
  );

  const rows = [new TableRow({ children: headerCells, tableHeader: true })];

  attendees.forEach((a, idx) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.name || "-", size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.position || "-", size: 20 })] })] }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "", size: 20 })] })],
          }),
        ],
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

async function documentationSection(documents) {
  if (!documents || documents.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: "-", size: 22 })] })];
  }

  const buffers = await Promise.all(
    documents.map(async (d) => ({ buffer: await fetchImageBuffer(d.url), type: inferImageType(d.fileName) }))
  );

  const cells = buffers
    .filter((b) => b.buffer)
    .map(
      (b) =>
        new TableCell({
          width: { size: 33.33, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: b.buffer,
                  transformation: { width: 170, height: 170 },
                  type: b.type,
                }),
              ],
            }),
          ],
        })
    );

  // susun 3 foto per baris
  const rows = [];
  for (let i = 0; i < cells.length; i += 3) {
    let rowCells = cells.slice(i, i + 3);
    while (rowCells.length < 3) {
      rowCells.push(new TableCell({ width: { size: 33.33, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [] })] }));
    }
    rows.push(new TableRow({ children: rowCells }));
  }

  if (rows.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: "-", size: 22 })] })];
  }

  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })];
}

function attachmentsSection(attachments) {
  if (!attachments || attachments.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: "-", size: 22 })] })];
  }

  return attachments.map(
    (att, idx) =>
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${idx + 1}. `, size: 22 }),
          new ExternalHyperlink({
            link: att.url,
            children: [
              new TextRun({
                text: att.fileName || att.url,
                size: 22,
                color: "1155CC",
                underline: {},
              }),
            ],
          }),
        ],
      })
  );
}

export async function exportMeetingToDocx(meeting) {
  const letterhead = await buildLetterhead();
  const docSection = await documentationSection(meeting.documents);
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
          infoRow("Kategori", meeting.category),
          infoRow("Jumlah Hadir", meeting.attendees?.length ? `${meeting.attendees.length} orang` : "-"),

          sectionHeading("Agenda"),
          bodyParagraph(meeting.agenda),

          sectionHeading("Pembahasan"),
          bodyParagraph(meeting.discussion),

          sectionHeading("Daftar Hadir"),
          attendeesTable(meeting.attendees),

          sectionHeading("Dokumentasi Rapat"),
          ...docSection,

          sectionHeading("Lampiran Rapat"),
          ...attachmentsSection(meeting.attachments),

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
