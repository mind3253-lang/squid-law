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

## Follow-on code (2026-10-12)
- `lib/visual-evidence.mjs`: page/image source inventory schema, OCR/vision verification contract, deferred provider request and cost estimate. The worker stores a *preliminary* visual plan with `visualInventoryComplete:false`; it is not a real image inventory.
- `lib/pdf-visual-inventory.mjs`: inspect PDF page image paint operators without paid services. This is a detection hint and is not yet wired into customer upload/worker or a verified extraction pipeline.
- `lib/provider-gate.mjs`: explicit opt-in, transfer consent and cost ceiling; no paid provider execution.
- `lib/case-reasoning.mjs`: proposition and source-quote audit, independent semantic audit gate. It is a contract, not an implemented AI legal reasoner.
- `lib/mock-case-pipeline.mjs`: deterministic end-to-end mock harness, whose status is `mock_completed` (never production completion).
- New tests: visual evidence, source citations, provider guard, mock pipeline. GitHub Actions and Vercel install command now run `node --test tests/*.test.mjs`.
- Queue bug fixed: DB error counter increments on error, not every 20-page checkpoint; original page numbers preserved across batches.

### Still required before production legal analysis
Wire actual page/image extraction and OCR into the durable worker, move full-file synchronous PDF processing to recoverable ingestion jobs, implement model-driven case structure and genuine independent reasoning, and exercise production API after provider approval. Do not report these items complete merely because their interfaces or mocks exist.

### Further integration
- `lib/batch-integrity.mjs` checks 20-page alignment, exact page count, no repeated/missing pages and manifest uniqueness. The customer worker uses it before writing a checkpoint.
- `lib/document-boundary-merge.mjs` combines boundary candidates across adjacent batches, rejecting overlap and page gaps. It is not yet invoked by a persistent final aggregation stage.
- `lib/case-crosscheck.mjs` detects polarity-based *candidates* across different source documents with a bounded output; semantic contradictions are **not verified**. The mock pipeline includes these candidates and date/amount cross-document matches.
- New tests cover 338/10,001 page batches, boundary merges and contradictory-pleading candidates.
- The worker still has no end-to-end finalizer; its blocked visual state is intentional until a real inventory, OCR and semantic audit are wired.

## Subsequent structural work
- `lib/analysis-stage-gates.mjs` and `lib/analysis-pipeline-state.mjs` enforce ten ordered stages and prevent completion from text-only checkpoints. `lib/analysis-receipts.mjs` supplies deterministic integrity digests (not cryptographic signatures).
- `lib/legal-reasoning-provider.mjs` creates source-anchored model prompts, rejects invented quotes/pages and refuses oversized contexts rather than truncating. `lib/reasoning-partitions.mjs` partitions long records without dropping units.
- `lib/legal-audit-provider.mjs` defines a separate reviewer model contract and validates findings. `lib/case-finalizer.mjs` requires complete stage receipts, independent case audit and distinct live provider response IDs. **No actual paid provider calls are implemented by these modules.**
- `lib/pdf-page-renderer.mjs` defines a bounded rasterization adapter requiring an injected canvas implementation; the concrete production canvas renderer is not yet connected. `lib/visual-processing-plan.mjs` builds gated vision requests from rendered pages, with whole-batch budget checks.
- `lib/text-review-manifest.mjs` validates that every expected output batch exists. Customer worker now saves the text-review manifest only after output coverage checks.
- `lib/page-digests.mjs` validates extracted page text against stored SHA-256 hashes. New customer PDF uploads persist these hashes; older uploads remain supported and are identified as legacy.
- Customer chat UI now labels its answers as *partial-page question responses*, not full-case legal analysis. SKYNET and customer responses expose the actual model ID returned by the API when present. SKYNET PDF batches share the preliminary visual review plan and explicitly mark inventory incomplete.
- New tests cover all the above contracts; production build is configured to run the full `tests/*.test.mjs` suite.

### Do not confuse contracts with operational completeness
The new stage state machine, legal model request/response schemas, visual rasterizer adapter and finalizer are **not** yet wired into a complete production background job. A renderer implementation, real vision/OCR, durable per-stage scheduling, independent legal reasoning calls and full-case end-to-end verification remain. Never label these items completed solely because mock tests pass.

## Latest verification gates and local fixture checks
- Visual results now require `inventoryComplete:true` and `independentVisualVerified:true`; the default customer/SKYNET plans have incomplete inventories and must remain blocked. Mock pipeline tests explicitly inject inventory and visual review responses.
- Empty legal propositions, fabricated citations, conflicting hashes for the same source location and serialized mock provider results are rejected.
- A local run against the 338-page fixture reconfirmed 338 page segments, 257,537 characters and 17 batches with no missing pages. Separate local PDF image enumeration found 829 image objects across all 338 pages; **no OCR or semantic visual review was performed**. A 10,001-page synthetic run covered all pages in 501 batches.
- The customer worker now verifies stored per-page text hashes when present, checks every output batch, and stores a text review manifest with explicit pending stages. The customer UI distinguishes a limited-page chat response from full-case analysis.
- The visual renderer is an injectable adapter without a concrete production canvas factory. The legal reasoning and independent audit modules are API contracts without real paid model calls. Actual operational quality is unverified.
