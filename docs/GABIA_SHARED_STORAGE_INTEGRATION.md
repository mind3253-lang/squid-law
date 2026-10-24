# Gabia shared storage integration

SKYNET chat recall, batch writes, Naver account records and customer analysis use shared storage integration through `lib/customer-object-storage.mjs`.

Configure `SQUIDLAW_OBJECT_BACKEND=gabia` and a private `SQUIDLAW_OBJECT_ROOT` on Gabia. Verify migrated object checksums and permissions before switching any production data path.

Do not infer production migration or data-copy completion from source changes. Verify current service configuration, customer routes, and stored objects on Gabia independently. Preserve existing customer data and checkpoints.
