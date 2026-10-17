import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('PDF upload and re-index route through persisted page windows',()=>{
 const html=file('admin/skynet.html');
 const api=file('api/skynet-document-range.js');
 const routes=JSON.parse(file('vercel.json'));
 assert.ok(routes.rewrites.some(x=>x.source==='/admin/skynet-document-range'&&
  x.destination==='/api/skynet-document-range'));
 assert.match(html,/async function indexArchivedPdfInWindows\(/);
 assert.match(html,/info\.complete===true/);
 assert.match(html,/info\.processedPages!==totalPages/);
 assert.match(html,/pdf\?await indexArchivedPdfInWindows\(batch,total,f\.name/);
 assert.match(html,/indexArchivedPdfInWindows\(selected\.batch,selected\.parts/);
 assert.match(api,/const WINDOW_PAGES=16/);
 assert.match(api,/extractPdfPagesByRange\(range/);
 assert.match(api,/PREVIOUS_PDF_WINDOW_MISSING/);
 assert.match(api,/PDF_SEGMENT_COVERAGE_INCOMPLETE/);
 assert.match(api,/receiptPath\(hash,startPage,mode='normal'\)/);
 assert.match(api,/if\(isFinal\)\{/);
 assert.match(api,/ingestMethod:'bounded_pdf_byte_ranges'/);
});
test('No arbitrary 25 or 100MB PDF ingestion threshold in the window route',()=>{
 const source=file('api/skynet-document-range.js');
 assert.doesNotMatch(source,/PDF_MAX_BYTES|OTHER_MAX_BYTES|100\*1048576|25\*1048576/);
 const html=file('admin/skynet.html');
 assert.doesNotMatch(html,/총 200MB|파일당 100MB/);
 const archive=file('api/skynet-archive.js');
 assert.match(archive,/total>99999/);
 const warehouse=file('api/skynet-warehouse.js');
 assert.doesNotMatch(warehouse,/parts>100\|\||size>104857600/);
});
test('Byte-range PDF.js integration uses bounded source reads and page windows',()=>{
 const extractor=file('api/customer-pdf-extract.js');
 const range=file('lib/skynet-pdf-range.mjs');
 assert.match(extractor,/PDFDataRangeTransport/);
 assert.match(extractor,/disableAutoFetch:true/);
 assert.match(file('api/skynet-document-range.js'),/pageCount:WINDOW_PAGES/);
 assert.ok(range.includes('cacheLimit=3'));
});
