# OCR benchmark — October 2026

Part of [#17](https://github.com/thehimmat/pir-sound-tracker/issues/17): capture one reading per second without raising the Fly bill. This records how the template-matching reader was chosen over Tesseract, so the comparison can be repeated.

## The budget

The poller runs on a Fly.io `shared-cpu-1x` VM, which guarantees 6.25% of one core: **about 62.5 ms of CPU per second**. It can burst above that only from a balance that refills while usage is below the baseline. Everything per frame has to fit in that budget to sustain one frame per second.

## Where the CPU went (before)

Measured per frame on real frames (CPU = user + sys, including child processes):

| Step | CPU per frame |
|---|---|
| Fetch (Node fetch, connection reused) | ~2.7 ms |
| `avgBrightness` (full Sharp decode) | ~3.6 ms |
| `preprocessImage` | **~50 ms** |
| Tesseract CLI, new process per frame (reloads the model) | **~130 ms** |

`preprocessImage` was mostly wasted. Sharp applies its operations in a fixed order, not call order, so `threshold()` ran before `normalise()` and `linear()`, which then changed nothing on an already black-and-white image. `normalise()` alone cost ~37 ms. Without the two calls the output is byte-identical (checked on 1,442 and again on 600 real frames).

## Corpus

- Real frames fetched from PIR's feed on 2026-10-06 at one per second, deduplicated by content.
- **1,754 labelled frames** (50.2–86.9 dB, 170 distinct values, every digit 0–9 present). Each label was read by two different Tesseract configurations; every disagreement, and a stratified sample of 219 agreements, was checked by eye. Frames with the same value have pixel-identical digits, so every value was confirmed visually.
- **125 corrupt frames**: PNGs truncated part-way (often exactly 2,771 bytes) or failing their CRC, returned with HTTP 200.
- **4,565 later frames** (collected after the labelled snapshot) for a held-out comparison.
- **Coverage gap:** no real frame was 90 dB or louder, and none had a 3-digit reading.

## Results

| Reader | Correct (1,754) | Wrong values | Rejected | CPU per frame |
|---|---|---|---|---|
| Production Tesseract, production's model | 97.0% | 0 | 53 (all frames of 54.1, 75.5, 77.4, 77.7) | ~130 ms + 50 ms preprocess |
| Same, standard `eng.traineddata` | 92.5% | 29 | 103 | same |
| Tesseract, tighter crop at half scale, one persistent process | 100% | 0 | 0 | ~3.7 ms incl. decode |
| **Template matching** | **100%** | **0** | **0** | **~1.2 ms incl. decode** |

Template matching was also tested:

- **Leave-one-value-out:** every value was read with templates built without any frame of that value: 1,754/1,754 correct.
- **Leave-one-digit-out:** with a digit missing from training, frames containing it are rejected (4,681 rejects, 0 misreads).
- **Synthetic layouts** (composited from real digit images, so this tests the method, not real frames): 90.0–99.9 and 100.0–130.0, with ±2 px shifts, noise and threshold changes: 0 wrong.
- **Held out:** on the 4,565 later frames, template matching and the best Tesseract configuration agreed on every readable frame. The repo's reader read all of them except the 334 corrupt frames.

**Parallel Tesseract processes do not help.** Under a cgroup cap matching Fly's quota, 1, 2 and 3 workers gave 0.43, 0.37 and 0.38 frames per second: they share the same CPU allowance and add overhead and memory.

**Live run** (90 s against PIR's real feed, local machine): about 13 ms of CPU per second in total, including Node's start-up.

## Truncated frames

About 6% of single requests return a truncated PNG; with the poller's overlapping fetches it was 16.5%. An immediate second request recovered 18 of 20, leaving ~1.7% of frames lost. The poller's 5-minute stats report `refetched=` and `corrupt=`.

## Known risks

- **No real 90+ dB or 3-digit frames yet.** If the meter draws those differently, template matching rejects them and Tesseract reads them instead (logged as `template rejected (...)`). Collect those frames during a loud session and rebuild the model with `apps/poller/src/digits/trainCli.ts`.
- **About 82% is the ceiling at one fetch per second.** PIR's server caches a frame for about a second, so polling once a second sees ~82% of the meter's seconds. Going higher needs faster fetching plus de-duplication by the meter's on-screen clock.
- The template model is tied to this screen layout and resolution. A firmware or display change means retraining; an unexpected frame size is rejected.
