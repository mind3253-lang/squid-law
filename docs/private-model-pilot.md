# SQUID LAW private live-model pilot (not a public service)

This is an **operator-only** test. It does not connect the customer webpage, payments, or server storage.

## Input
Create a JSON file on a trusted local computer containing **already extracted PDF page text**:

```json
[
  {"name":"contract.pdf","pages":[{"text":"The extracted text of page 1..."},{"text":""}]}
]
```

Pages are 1-indexed by their array positions. Empty text represents an unreadable page. Use unique PDF filenames. The pilot accepts up to 12 files, 50 pages total, and 12,000 characters per page.

## Explicit permission and execution
Use only material you are authorized to transmit to an external AI service. Check confidentiality and personal-data obligations first. In a local terminal, set `OPENAI_API_KEY` and `SQUIDLAW_LIVE_PILOT=I_CONSENT_TO_SEND_DOCUMENT_TEXT`, then run:

```bash
node scripts/private-model-pilot.mjs /secure/path/extracted-pages.json > /secure/path/pilot-result.json
```

Do **not** upload API keys, customer PDFs, or the result JSON to GitHub. The script uses `store:false` in the model request; this does not imply zero provider-side retention. Consult provider data handling terms before processing sensitive records.

## Output and limitations
The model produces candidate observations with exact PDF/page/quote citations. Local verification checks each quotation against extracted source text. Findings with unmatched or missing citations are omitted from the output; aggregate verification counts remain. Even matched quotations **do not prove the underlying assertion is true**. There is no independent legal conclusion, citation authenticity proof, or OCR for scanned PDFs.

The API call incurs provider charges. The model can be set via `SQUIDLAW_MODEL` (default `gpt-4.1-mini`). This script is not a substitute for end-to-end security, cost budgeting, adversarial tests, real PDF trials, or production authorization.
