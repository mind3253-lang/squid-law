import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {renderPdfPageImages} from '../lib/pdf-page-renderer.mjs';
test('page rasterization requires explicit bounded pages and renderer adapter',async()=>{
 await assert.rejects(()=>renderPdfPageImages(Buffer.from('%PDF-'),{pageNumbers:[1]}),/INVALID_PDF_RENDER_REQUEST/);
 await assert.rejects(()=>renderPdfPageImages(Buffer.from('%PDF-'),{pageNumbers:[],canvasFactory:()=>({})}),/INVALID_PDF_RENDER_REQUEST/);
});
