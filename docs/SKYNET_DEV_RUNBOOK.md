# SKYNET development engine — operations

This initial worker creates GPT API development plans and persists them in PostgreSQL. It **does not** edit repositories, execute model-authored shell commands, deploy code, or run continuously by itself.

Environment: `SKYNET_DEV_DATABASE_URL` (or `SQUID_CUSTOMER_DATABASE_URL`), `OPENAI_API_KEY`, optional `SKYNET_DEV_MODEL`.

Run on a trusted server with Node 22+ and access to the PostgreSQL database:
```sh
node scripts/skynet-dev-enqueue.mjs "skynet" "Describe the required feature"
node scripts/skynet-dev-worker.mjs
node scripts/skynet-dev-status.mjs
node scripts/skynet-dev-retry.mjs TASK_UUID
```

For uninterrupted execution schedule the worker via an OS service/timer or queue scheduler, and separately implement verified GitHub edit/deploy actions. A chat session is not a worker. Worker failure is persisted as `failed` and can be retried explicitly.

The current GitHub Actions integration workflow checks syntax and secret presence; it does not establish that the Gabia DB or GPT API can be reached. Deployment and actual live integration require configured credentials and an authorized runner.
