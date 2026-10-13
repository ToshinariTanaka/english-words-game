# Complete all 9185 questions

On 2026-10-14 JST the user explicitly approved all four modes and the additional
8645 questions × Nova/Ash = 17290 paid files. Reuse the existing 1080 files without
regenerating them. The resulting catalog is 18370 files covering 7489 words,
856 chunks, 441 phrases, and 399 sentence-translation questions.

## Fixed scope and service check

- Model remains `gpt-4o-mini-tts-2025-12-15`, with the approved neutral American
  reading instructions and existing normalization. Model/profile changes require
  a separate reviewed change. Maximum English input in the catalog is 389 chars.
- Checked official docs on 2026-10-14 JST: input $0.60 / 1M text tokens, output
  $12 / 1M audio tokens; 4096 input characters maximum; retirement 2027-01-06.
  Sources: https://developers.openai.com/api/docs/models/gpt-4o-mini-tts and
  https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
  and https://developers.openai.com/api/docs/deprecations .
- Actual charges are available in OpenAI Usage. File counts and durations are
  not a billing receipt. No automatic top-up or project billing setting is changed.
- This preserves the previously reviewed pronunciation cases. It is not a human
  listening review of every new word/sentence.

## Execution

Workflow: **Complete all 9185 questions**. First main merge starts the fixed job
once. A durable approval record prevents later pushes from restarting it. PR runs
are offline and receive no secrets. Later explicit actions: `resume`, `publish`,
`rollback`; the default manual action is `validate` with no network or spending.

Initialization verifies the currently published 1080 files and scans request/raw
inventory for uncertain prior paid outcomes across the entire remaining scope.
Then 35 fixed batches run automatically, at most four batches concurrently. Each
runner processes up to four files in parallel and starts at most one API request
per second. Total upper bounds: 16 in-flight files and 240 API starts/minute. Actual
account-specific service limits can be lower; errors stop the attempt.

The final batch contains 290 files; the others contain 500. Voices stay paired
within each batch. 150-minute soft deadline and 180-minute job timeout preserve
time for in-flight saves and artifact upload. There is no estimated completion
guarantee: prior runtime, network and service latency can cause substantial variation.

## Failure and resume

Every successful file and its ledger are saved to R2. Completed files are read
and verified, never regenerated. Raw audio saved before a processing error is
reprocessed without another API call. No failed API request is automatically
retried: a timeout may already have incurred a charge.

Transient R2 reads and conditional writes receive up to three attempts. A lost
write response is reconciled against the saved bytes before continuing. These
storage retries never retry a paid OpenAI request or overwrite another claim.

On failure, a run-attempt-specific R2 stop record halts queued work; in-flight
requests finish saving. `fail-fast: false` avoids cancellation in the middle of
paid requests. GitHub **Re-run failed jobs** uses a new attempt identity and resumes
failed batches, while a manual `resume` rechecks all batches. Uncertain request
records must be investigated/restored from raw rescue artifacts before resuming.
Do not delete request records or MP3s to force regeneration.

Artifacts `audio-all-batch-<n>-attempt-<n>` contain counts and raw rescue copies.
The R2 run reports also preserve each batch's requested/reused/completed counts.
The durable approval means a prepare-stage failure after claiming the request
requires explicit manual `resume`, rather than a later push starting it silently.

## Automatic publication

Only after all 35 generation batches succeed, verify all 18370 processed files,
build four immutable manifests, preserve all 1080 existing entries, and atomically
switch the current pointer with an ETag precondition. Full manifests must fit the
existing app's 8 MiB per-mode limit. Verify all four public manifests and checksum
representative Nova/Ash deliveries through the app. Reload an existing browser
tab after publication to refresh its in-memory manifest.

`publish` only verifies and publishes existing files; it never calls OpenAI.
`rollback` restores the verified 1080-file release, even if a new audio file is
missing. Unknown/concurrently changed releases are never overwritten. A report
with `published_delivery_check_pending` means the pointer changed but public
verification failed. Inspect before rerunning the explicit `publish` action.

## Keys and Excel

Excel column M `question_key` remains the join key. Asset IDs also bind the exact
English text, voice and generation recipe. The all-question Excel mapping includes
all keys before generation; its `音声区分（生成開始時）` distinguishes the existing
1080 files from the newly authorized 17290 files, not a live progress indicator.

Artifacts `all-9185-audio-keys` and `all-9185-publication` include the matching CSV.
The publication result is the evidence that every planned key is now live. No
student learning records, translations or choices are sent to the speech API.

## Tests

`python -m unittest discover -s tests -p test_audio_all.py`

Exercises fixed counts and intact voice pairs, single initial launch, whole-scope
uncertain request detection, reuse without new calls, shared stop, processing
recovery from raw audio, deadline before claiming, missing final file, exact full
publication, manifest size, preserved previous entries, rollback and offline mode.
