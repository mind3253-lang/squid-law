from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
out = Path('tests/fixtures/ci-evidence.pdf')
out.parent.mkdir(parents=True, exist_ok=True)
buf = BytesIO()
pdf = canvas.Canvas(buf, pagesize=(612, 792), pageCompression=0)
pdf.setFont('Helvetica', 12)
pdf.drawString(72, 720, 'SQUIDLAW TEST EVIDENCE FOR ISOLATION')
pdf.showPage()
pdf.save()
out.write_bytes(buf.getvalue())
print('Synthetic CI PDF generated')
