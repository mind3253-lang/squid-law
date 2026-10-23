import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
import {normalizeDocument,renderHwpx} from '../lib/document-export.mjs';
test('HWPX export retains full template and Korean body',()=>{
 const report='원고의 주장과 피고의 반박 & 증거 <갑 제1호증>';
 const zip=unzipSync(renderHwpx(normalizeDocument({title:'법률 분석 보고서',text:report})));
 for(const key of ['mimetype','version.xml','Contents/content.hpf','Contents/header.xml','Contents/section0.xml','META-INF/container.xml','META-INF/manifest.xml','settings.xml'])assert.ok(zip[key],key);
 const section=Buffer.from(zip['Contents/section0.xml']).toString('utf8');
 assert.match(section,/원고의 주장과 피고의 반박 &amp; 증거 &lt;갑 제1호증&gt;/);
 assert.match(section,/<hp:secPr/);
 assert.match(section,/<\/hs:sec>/);
 assert.ok(!section.includes('__TABLE__'));
 assert.ok(!section.includes('__END__'));
});
