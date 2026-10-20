# Gabia unified storage consumer cutover (candidate)
SKYNET chat prepared recall reads, SKYNET batch writes and Naver account record reads/writes now share `lib/customer-object-storage.mjs` with the customer analysis worker. This does not activate Gabia in production: `SQUIDLAW_OBJECT_BACKEND` still defaults to `vercel`.
On Gabia, set `SQUIDLAW_OBJECT_BACKEND=gabia` and an isolated, private `SQUIDLAW_OBJECT_ROOT` only after migration and checksum validation. Naver OAuth credentials and redirect origin must be configured independently.
The current staging API gateway has no enabled customer routes, so this commit is NOT production migration or permission to retire Vercel. No data is copied by these changes.
