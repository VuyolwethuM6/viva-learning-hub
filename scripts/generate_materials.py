from pathlib import Path

root = Path(__file__).resolve().parents[1]
materials_dir = root / 'public' / 'materials'
materials_dir.mkdir(parents=True, exist_ok=True)

items = [
    ('grade-12-mathematics-paper-1.pdf', 'Grade 12 Mathematics Paper 1', 'Sequence & Series', 'Revision notes and practice questions for the most tested Grade 12 maths topics.'),
    ('grade-12-mathematics-paper-2.pdf', 'Grade 12 Mathematics Paper 2', 'Trigonometry & Geometry', 'Exam-focused worksheets that help learners revise high-frequency patterns and formulas.'),
    ('physical-sciences-essentials.pdf', 'Physical Sciences Essentials', 'Revision Bundle', 'Physics and chemistry summaries built for quicker retention before assessment week.'),
    ('grade-12-life-sciences-guide.pdf', 'Life Sciences Revision Guide', 'Core Topics', 'A clean, structured notes pack covering the main Grade 12 Life Sciences focus areas.'),
]


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def make_pdf(path: Path, title: str, subtitle: str, body: str):
    title = esc(title)
    subtitle = esc(subtitle)
    body = esc(body)
    content = (
        f"BT /F1 24 Tf 72 720 Td ({title}) Tj ET\n"
        f"BT /F1 14 Tf 72 690 Td ({subtitle}) Tj ET\n"
        f"BT /F1 12 Tf 72 660 Td ({body}) Tj ET\n"
    )
    stream = content.encode('latin-1', 'replace')

    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        f'<< /Length {len(stream)} >>\nstream\n{content}endstream'.encode('latin-1', 'replace'),
    ]

    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{i} 0 obj\n'.encode('latin-1'))
        pdf.extend(obj)
        pdf.extend(b'\nendobj\n')

    xref_pos = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('latin-1'))
    pdf.extend(b'0000000000 65535 f \n')
    for off in offsets[1:]:
        pdf.extend(f'{off:010d} 00000 n \n'.encode('latin-1'))

    pdf.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n'.encode('latin-1'))
    path.write_bytes(pdf)


for filename, title, subtitle, body in items:
    make_pdf(materials_dir / filename, title, subtitle, body)

print(f'Created {len(items)} PDF files in {materials_dir}')
