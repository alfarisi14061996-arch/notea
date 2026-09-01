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
  VerticalAlign,
  TableLayoutType,
} from "docx";
import { saveAs } from "file-saver";
import sealUrl from "./official-seal.png";

const PRIMARY = "0F3D3E";

async function fetchSealBuffer() {
  try {
    const res = await fetch(sealUrl);
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

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

// Kop surat resmi Pengadilan Agama Purwokerto: lambang di kiri, identitas
// instansi rata tengah di kanan, diikuti garis pembatas tebal — meniru format
// kop surat dinas yang sudah baku dipakai kantor.
async function buildLetterhead() {
  const sealBuffer = await fetchSealBuffer();

  // Halaman A4 default docx-js: 11906 dxa lebar, margin 1440 tiap sisi -> 9026 dxa usable
  const LEFT_W = 1750;
  const RIGHT_W = 7276;

  const sealCell = new TableCell({
    width: { size: LEFT_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: sealBuffer
          ? [new ImageRun({ data: sealBuffer, transformation: { width: 95, height: 136 }, type: "png" })]
          : [new TextRun({ text: "" })],
      }),
    ],
  });

  const textLines = [
    "MAHKAMAH AGUNG REPUBLIK INDONESIA",
    "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA",
    "PENGADILAN TINGGI AGAMA SEMARANG",
    "PENGADILAN AGAMA PURWOKERTO",
  ].map(
    (text) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text, bold: true, size: 24, color: "000000" })],
      })
  );

  const addressLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({
        text: "JL. Gerilya NO. 7A Purwokerto – 53143 TELP. 0281-636366 FAX. 0281-643289",
        bold: true,
        size: 17,
        color: "000000",
      }),
    ],
  });

  const contactLine = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: "website : ", bold: true, size: 17, color: "1155CC" }),
      new ExternalHyperlink({
        link: "http://www.pa-purwokerto.go.id",
        children: [new TextRun({ text: "http://www.pa-purwokerto.go.id", bold: true, size: 17, color: "1155CC", underline: {} })],
      }),
      new TextRun({ text: " email : ", bold: true, size: 17, color: "1155CC" }),
      new TextRun({ text: "pa.purwokerto@gmail.com", bold: true, size: 17, color: "1155CC" }),
    ],
  });

  const textCell = new TableCell({
    width: { size: RIGHT_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [...textLines, addressLine, contactLine],
  });

  const headerTable = new Table({
    width: { size: LEFT_W + RIGHT_W, type: WidthType.DXA },
    columnWidths: [LEFT_W, RIGHT_W],
    layout: TableLayoutType.FIXED,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: [new TableRow({ children: [sealCell, textCell] })],
  });

  return [
    headerTable,
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 24, color: "000000" },
      },
      spacing: { before: 100, after: 200 },
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

function infoTable(rows) {
  const LABEL_W = 1900;
  const COLON_W = 260;
  const VALUE_W = 9026 - LABEL_W - COLON_W;
  const NO_MARGIN = { top: 0, bottom: 0, left: 0, right: 0 };

  const tableRows = rows.map(
    ([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: LABEL_W, type: WidthType.DXA },
            margins: NO_MARGIN,
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: label, bold: true, size: 22 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: COLON_W, type: WidthType.DXA },
            margins: NO_MARGIN,
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: ":", bold: true, size: 22 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: VALUE_W, type: WidthType.DXA },
            margins: NO_MARGIN,
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
            children: [
              new Paragraph({
                children: [new TextRun({ text: value || "-", size: 22 })],
              }),
            ],
          }),
        ],
      })
  );

  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [LABEL_W, COLON_W, VALUE_W],
    layout: TableLayoutType.FIXED,
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    rows: tableRows,
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

  const headerCells = ["No", "Nama", "Jabatan / Unit"].map(
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
          infoTable([
            ["Judul Rapat", meeting.title],
            ["Tanggal", formatDate(meeting.date)],
            ["Pemimpin Rapat", meeting.leader],
            ["Kategori", meeting.category],
            ["Jumlah Hadir", meeting.attendees?.length ? `${meeting.attendees.length} orang` : "-"],
          ]),
          new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "" })] }),

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
            children: [new TextRun({ text: `Purwokerto, ${formatDate(meeting.date)}`, size: 22 })],
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
