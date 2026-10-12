# Upload the approved trial to R2

The user created private Standard R2 bucket `up-words-audio` and saved repository secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`. The token is limited to Object Read & Write on this bucket and expires after one week. No secret is in source, artifacts or logs.

Workflow: Upload approved audio trial to R2. Push validates offline safeguards and downloads source run 38191239119, then checks the artifact against the approved plan and ledger. It does not write R2. After merge into main, manually dispatch with upload=true to copy 60 processed MP3 files, 60 raw originals and three records. It never receives OPENAI_API_KEY and never calls OpenAI.

Each processed MP3 uses the playback-compatible object_key from the plan. Originals and plan/state/summary are backed up under backups/audio-trials/38191239119/. All inputs are validated before writing. Each destination object is read back and byte-compared; sha256 metadata is also checked. Existing identical objects are reused; differing objects stop the job. Conditional creation prevents replacing an object added concurrently. Re-running this upload reuses existing matching files and does not regenerate audio.

The report artifact `audio-r2-verification` contains per-object checksums, byte counts and status, with complete=true only after all 123 objects pass. A partial upload is safe to resume. No delete operation, bucket configuration change, public access change, playback current.json update, database access or production deployment is performed.

Next phase: bind JUNIOR_AUDIO to this bucket on the Cloudflare student project, build and validate four playback manifests against the current catalog, and switch current.json only after checks. Upload success alone does not mean audio is enabled in the student app.

Operational evidence on 2026-10-12: user approved Nova/Ash quality on PC and iPhone; OpenAI Usage screenshot filtered to up-words-audio showed 60 requests and rounded total spend $0.06. Full generation has not run. GitHub trial artifact expires 2026-11-11; this upload preserves the source files in R2.

Reference: https://developers.cloudflare.com/r2/examples/aws/boto3/
