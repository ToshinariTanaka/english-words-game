# Nova / Ash trial runner

The trial contains 30 questions (12 words and 6 in each other mode), 60 API calls at most, no automatic retry, and no R2 publication. The 30-question English excerpt is versioned in tools/audio-sample-plan.json; the complete Excel and full generation plan remain excluded. Pronunciation instructions were checked against column D of the original workbook. Both live entries mean verbs (reside / be alive), so both use /lɪv/; neither is the adjective /laɪv/. Guidance also specifies minute (time), present (current time noun), read (base form), record (noun), use (verb), wind (air), and standalone article forms. Only column C remains in the spoken input. Human listening review remains pending. Unresolved pronunciation-review flags block generation.

The user saved a dedicated seven-day TTS Request key in repository secret OPENAI_API_KEY. Never log or include it in artifacts. The production student branch remains feature/junior-nova-ash-audio-foundation-20261011; this change is isolated on feature/audio-sample-runner-20261012.

Push runs offline tests and a dry run only. Paid generation requires a manual workflow_dispatch with generate=true. GitHub requires the workflow on the repository default branch before the manual dispatch UI is available; do not merge the entire Cloudflare feature stack merely to enable it. Transfer only the four trial files (runner, plan, test, workflow) to the default branch through a focused PR if needed.

Download the nova-ash-trial artifact and unzip it, then open listen.html to compare voices. It includes original MP3, normalized mono 96 kbps MP3, plan, state ledger and summary. Artifacts expire after 30 days: download and back them up before then. This artifact is a trial, not the public playback manifest.

On failure, preserve the artifact. Resume using its run ID so successful audio is reused. Never rerun paid generation with an empty resume ID after an earlier paid attempt. A request with an uncertain outcome stops without retry. A lost runner or failed artifact upload can leave billable calls without recoverable audio; investigate before another run.

Normalization targets -20 dB mean with peak headroom of 1.5 dB and a maximum gain of 12 dB; it does not trim audio. This is an initial listening profile, not a promise of equal perceived loudness. Review short words on phones before adopting it for all questions.

Official documentation checked 2026-10-12 lists gpt-4o-mini-tts-2025-12-15 and Nova/Ash. Model page marks this model deprecated. Recheck availability before later generation. Listed pricing: text input $0.60 / million tokens; audio output $12 / million tokens. Do not label duration-based estimates as actual billing. Read actual cost from OpenAI Usage filtered to up-words-audio after the run. No fixed dollar cap is enforced by this runner: safeguards are 60 jobs, <=4000 input characters and no automatic retries.

Sources: https://developers.openai.com/api/docs/models/gpt-4o-mini-tts and https://developers.openai.com/api/docs/guides/text-to-speech

Cloudflare admin preview failure on this main-based trial branch is caused by missing scripts/build-junior-admin.js, as confirmed in the deployment log. This branch is for GitHub Actions and does not contain the Cloudflare application stack. Do not add a dummy build script or change the production branch to make this unrelated preview green.
