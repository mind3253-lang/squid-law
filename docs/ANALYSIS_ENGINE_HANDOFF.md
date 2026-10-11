# SQUIDLAW analysis engine: implementation contract and handoff

## Operating rule
Build the complete end-to-end architecture before purchasing new API services. Use deterministic and mock tests during implementation; conduct a real, full-case legal analysis and independent legal-quality review only after all stages are connected. Do not optimize upload latency ahead of completeness, correctness, isolation and recovery. Never call partial text extraction a completed legal analysis.

## Immutable source identity
Every derived page, image, claim and citation must retain the source document ID, **original** 1-based page number, segment index, content digest and source version. Never renumber pages to 1..20 inside a processing batch. `segmentRecord` accepts absolute page numbers; `prepareCorpus` requires a complete document and is unsuitable for an arbitrary 20-page window. The worker now uses `segmentRecord` directly.

## Queue and checkpoints
The DB `attempts` counter must count **errors only**, not normal successful 20-page checkpoints. A completed checkpoint schedules the next batch, while error retry increments the error count. The worker must preserve its source version, private output path and checkpoint. Lease fencing is required to avoid concurrent writes. 338 pages require 17 batches; 10,001 pages require 501 batches. Resume must not repeat successful batches as new outputs.

## Stage gates
1. Upload integrity: bytes, SHA-256, exact page count, stable manifest.
2. Text integrity: extraction coverage and exact source references; empty pages explicitly require OCR.
3. Visual evidence: enumerate images and page renders, OCR/vision results and provenance.
4. Logical document segmentation: candidate boundaries distinct from confirmed boundaries.
5. Case model: parties, pleadings, timeline, claims, denials, counterclaims and evidence.
6. Cross-document contradiction review: competing propositions with citations and uncertainty.
7. Legal reasoning: model-generated conclusions only with supported source references.
8. Independent verification: source re-read, citation validity, contradictions, missing documents, incomplete stages.
9. Finalization: allowed only after every required gate is verified; otherwise explicitly blocked/incomplete.

A regex-derived date, amount or claim keyword is **only an unverified candidate**. The existing `analyzeUnit` and `independentlyVerify` validate text content/hash correspondence; their `verified` status is **NOT** evidence validity, legal accuracy or full-case completion. No UI should present it as such.

## Current limitations (do not report as completed)
- PDF visual objects and OCR are not processed by the customer worker. The worker deliberately ends in `VISUAL_EVIDENCE_NOT_VERIFIED`.
- The legal observations are regex candidates, not model-powered claim/rebuttal reasoning.
- No true independent legal merits verifier exists.
- Upload completion currently buffers all chunks, concatenates the full PDF and extracts it synchronously. Maximum 100 MiB / 100 chunks; no durable large-file extraction worker.
- SKYNET PDF indexing and customer worker share observation logic but not a complete end-to-end reasoning engine.
- The worker is scheduled by Vercel cron every 5 minutes; end-to-end 501-batch runtime requires separate operational evaluation.
- Actual GPT-6 API model selection and live inference are not verified.
- Mock test success must never be represented as actual API or legal quality verification.

## Paid service integration
Implement provider adapters, schemas, quotas, consent, retries, idempotency, response storage, and mocked integration tests first. Do not incur new fees or transfer sensitive customer documents to new third parties without explicit approval. At the final integration phase, register payments once, connect providers and run real full-case tests.

## Known prior test fixture
A 338-page real PDF was previously inspected locally: 257,537 extracted characters, 829 embedded images, 17 20-page batches. These figures are *prior observations*, not proof of current production behavior. A 10,001-page synthetic segmentation test checks only page retention, not PDF upload or AI reasoning.

## Validation
Run `node --test tests/record-chunks.test.mjs`; deployment install command currently gates on this test and a DB migration. Confirm production READY and separately verify live API calls before claiming operating success.

## Handoff
Read current repository HEAD, tests, Vercel deployment and actual source files before changing code. Fix structural defects in shared modules; do not create parallel emergency pipelines. Document code completion, mocked coverage, production verification and real legal analysis quality separately. Continue independent work when a single tool or paid provider is blocked.
