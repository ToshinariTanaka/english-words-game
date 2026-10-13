# Publish the completed 1080 audio files

The user approved integrating the completed batch on 2026-10-14 JST. This publishes
the original 60 files, the 20-file pilot, and the fixed 1000-file batch. The total
is 540 questions: 522 words and 6 questions in each of the other three modes.
The latest batch itself is **500 words × 2 voices**, not 1000 distinct words.

Existing Excel column M `question_key` remains authoritative. Matching uses mode,
question key, exact normalized English SHA-256, voice and asset ID. No keys or
learning records are renumbered. Nova/Ash/random selection uses the existing app.

## Publication

Merging this workflow to main automatically publishes this fixed completed set
only if its durable transition record does not yet exist. The record is written
before switching the pointer and is retained on rollback. Later code/test pushes
and reruns skip publication, so they cannot silently undo a rollback. If the first
attempt stopped after writing the record, use the explicit manual `publish` action
to resume after inspection.
PR runs are offline only. Manual Actions: **Publish completed 1080 audio files**,
action `validate`, `publish`, or `rollback`. No OpenAI secret or API call is used.

1. Verify the saved generation plans and all 1080 MP3 hashes against their ledgers.
2. Verify the current original 60-file manifests and preserve every original entry.
3. Store four immutable manifests, a transition record and the prior pointer backup.
4. Change `audio/junior/current.json` using its current ETag with `IfMatch`.
   A different or concurrently changed release is never overwritten.
5. Compare all four public manifests through the app, then checksum both voices
   for first/middle/last questions of each mode and the added batch boundaries.

Existing app tabs cache the manifest in memory: reload the app after publication.
Unsupported questions still use device speech. A missing file aborts publication;
this workflow cannot generate or repair audio.

`audio-publication-1080` contains result.json, the manifest files, ledger.json,
and a UTF-8 CSV of all 1080 existing audio keys. A successful result says
`published_and_verified`. If delivery fails after the switch, it says
`published_delivery_check_pending`: publication has already occurred. Rerunning
with explicit `publish` rechecks the same release without generation. Investigate
before changing anything.

## Rollback

Run the same workflow manually with `rollback`. It verifies the original 60 files
and manifests, then atomically restores that known release. New MP3 damage does
not block rollback; unknown current releases do. Audio files are never deleted.
The previous manifests and all newly generated audio remain stored.

## Validation

`python -m unittest discover -s tests -p test_publish_audio_1080.py`

Covers exact counts, preserved voice pairs, idempotence, missing/corrupt MP3s,
changed plans, manifest collisions, concurrent pointer changes, delivery failure
after publication, wrong delivered audio, and rollback with missing new audio.
