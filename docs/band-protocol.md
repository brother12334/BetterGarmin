# Garmin band protocol (CIRQA)

How BetterGarmin talks directly to a Garmin CIRQA band over Web Bluetooth, and
what has and hasn't been verified on a real device. The code lives in
`src/lib/band/`:

- `band.test.ts` checks every byte string below.
- `replay.test.ts` replays 12 original notification packets from a real CIRQA
  workout (Protocol Lab 1.7 developer packet).
- `bandStore.test.ts` runs the app's command tracking against those real event
  packets.

Schema facts (field numbers, enums) come from the CIRQA developer packet,
which reconstructed them from the owner-supplied Android descriptor pack.

## Status

| Feature | Status |
| --- | --- |
| Connect, MultiLink registration, GFDI handshake | ✅ Verified on a CIRQA (60-second connection check passed) |
| Start Strength (10/20), pause, resume, save | ✅ Verified: the band reported matching events, and the saved workout appeared in Garmin Connect |
| Discard | ⚠️ Derived from the command enum, not physically tested. The app asks for confirmation first. |
| Test band alert (Find My Watch) | ✅ Physical alert confirmed. Cancelling isn't verified. |
| File listing | ✅ Verified (17 references over two pages); decoded exactly by `files.ts` |
| File download and import | 🧪 Implemented and simulator-tested; **not yet verified on a real band** |
| Custom vibration patterns | ❌ Unknown |
| Stored wake-up alarms | ❌ Not implemented; see [Alarms](#alarms) |
| Heart rate over the standard service (0x180D) | Declared for device selection only; streaming hasn't been tested |

## Bluetooth

| Purpose | UUID |
| --- | --- |
| MultiLink service | `6a4e2800-667b-11e3-949a-0800200c9a66` |
| Notifications | `6a4e2810-667b-11e3-949a-0800200c9a66` |
| Write | `6a4e2820-667b-11e3-949a-0800200c9a66` |
| Optional information read | `6a4e2803-667b-11e3-949a-0800200c9a66` |
| Optional Heart Rate service | `0000180d-0000-1000-8000-00805f9b34fb` |

1. Subscribe to notifications **before** registering.
2. Register GFDI on MultiLink: `00 00 01 00 00 00 00 00 00 00 01 00 00`
   (service 1, client ID 1, options 0). Client ID 1 is a registration
   identifier, not a secret.
3. Wait for a successful response (status 0) and use the routing handle it
   returns. Handles 4, 5 and 18 have all been seen, so it's never hardcoded.
4. Writes are 20 bytes: the routing handle plus up to 19 stream bytes. The
   band's 512-byte GFDI packet limit is not the Bluetooth MTU.

## GFDI framing

Each frame is a little-endian u16 total length, a u16 message ID, the payload,
then a little-endian CRC-16/ARC over everything before it. The frame is
COBS-encoded with zero delimiters, then split into MultiLink writes. Message
IDs: 5000 acknowledgment, 5024 device information, 5043 protobuf request, 5044
protobuf response, 5050 configuration.

Frames can use a compact, transaction-tagged header: the high bit of byte 3 is
set, byte 2 is the ID minus 5000, and bits 0–6 of byte 3 are the tag. Replies
to a tagged frame reuse its tag.

Handshake, after registration:

1. The band sends Device Information (5024). The host replies with an ACK
   carrying its own information: protocol 113, name `BetterGarmin`.
2. The band sends Configuration (5050). The host acknowledges it, then sends its
   own configuration with bits 9, 81, 95 and 105.
3. The band acknowledges the host configuration, and the session is ready.

Other messages:

- **5027 (handshake capabilities):** acknowledged with status 0.
- **5045:** the band cancelled a protobuf request.
- **5101–5112 (proprietary authentication):** these stop the session with an
  explanation. No reply is guessed.
- **Anything else:** left unanswered, since a guessed reply could be taken as
  agreement.

No app-authentication exchange was needed on the tested band. That may not hold
for every device or pairing state.

Protobuf transport (5043/5044): u16 request ID, u32 offset, u32 total length,
u32 fragment length, then the bytes. Responses are matched by request ID and
expected message type, and only one Smart request is outstanding at a time.

Every incoming protobuf fragment is acknowledged with: original ID, status,
request ID, offset, chunk status and detail. Detail 101 marks a duplicate
fragment. A band-initiated request nothing handled gets status 1 and detail
201.

## Smart payloads

| Operation | Payload |
| --- | --- |
| LiveSession capabilities | `6a 05 42 03 9a 02 00` |
| EventSharing supported alerts | `f2 01 02 22 00` |
| Subscribe to LiveSession events (alert 19) | `f2 01 06 0a 04 0a 02 08 13` |
| Start Strength 10/20 | `c2 03 0b 8a 01 08 0a 04 08 0a 10 14 10 00` |
| Resume / Pause / Save / Discard | `c2 03 05 8a 01 02 10 0N`, with N = 1, 2, 3, 4 |
| Find My Watch / cancel | `62 04 0a 02 08 03` / `62 02 1a 00` |
| FileAccess capabilities | `6a 05 42 03 82 01 00` |
| List files (max 10) / continue | `da 02 04 4a 02 18 0a` / `da 02 04 4a 02 08 <session>` |

Routing: Smart 12 Find My Watch, 13 Core, 30 EventSharing, 43 FileAccess, 56
LiveSession. LiveSession 17 is the app command and 18 its response.
EventSharing alert 19 is LiveSession; extension 1012 carries the event.

The CIRQA advertises Strength (capability bit 58) but not Sport Profile Setup
(bit 56), so profile-list requests are skipped. The favorites exchange isn't
used for profile discovery: it runs band-to-phone.

### Activity setup

When the session is ready, BetterGarmin does the same setup as the tested
client before sending any activity command:

1. Check the band advertises bits 81, 95 and 105.
2. LiveSession capabilities (Smart 13 → 9 → 35) must report
   `allowRemoteTerminate`.
3. EventSharing supported alerts must include 19.
4. The subscription to alert 19 must report status 0.
5. The band must advertise Strength (bit 58).

### LiveSession events

Path: Smart 30 → 3 (alert notification) → extension 1012 (live session event).
Inside it:

- **1, activity start request:** 1 uuid { fixed64 1 most significant, fixed64
  2 least significant }, 2 sport profile { 1 sport, 2 sub-sport }
- **2, activity state request:** 1 state, 2 end reason (0 SAVED, 1 DISCARDED)
- **3:** activity data

States: 0 START, 1 STOP, 2 PAUSE, 3 RESUME, 4 ENDED, 5 SAVING, 6 DISCARDING, 7
WORKOUT_ENDED, 8 WORKOUT_WARMUP, 9 WORKOUT_ACTIVE, 10 WORKOUT_REST, 11
WORKOUT_COOLDOWN.

The real capture produced START, WORKOUT_ACTIVE (start); STOP (pause); START
(resume); STOP, SAVING, ENDED/SAVED (save).

The activity UUID comes **only** from the activity start request. Its two
halves are kept as raw little-endian wire bytes and never converted to a
JavaScript number. Command responses don't carry it; if no start request
arrives, it stays unknown.

### How commands are tracked

- **Sent:** written to Bluetooth.
- **Accepted:** the matched LiveSession 18 response has no failure field 1.
  Field 1 present means the band rejected it.
- **Band confirmed:** the band reported the state that command produces:
  - Start: START, WORKOUT_ACTIVE or the start request
  - Pause: STOP or PAUSE
  - Resume: START, RESUME or WORKOUT_ACTIVE
  - Save: SAVING or ENDED/SAVED
  - Discard: DISCARDING or ENDED/DISCARDED

A transport ACK alone never counts as accepted. A timeout is never retried
automatically: the band may already have acted, so the command shows as
**uncertain**.

## Direct sync (experimental)

Implemented from the CIRQA-Sync-Protocol packet in `bandSync.ts`, `reliable.ts`,
`files.ts` and `fitImport.ts`. **It has been tested in the simulator only, not
on a real band yet.** For each file the band lists that hasn't been synced, it
runs these steps:

1. **Register a reliable file pipe.** Use a service from the pool `0x2018,
   0x4018 … 0xE018`, with options 2, for example `00 00 01 00 00 00 00 00 00
   00 18 20 02`.
   - Require status 0 and a reliable handle (`0x80`–`0x87`).
   - The service ID, routing handle and transfer handle are kept separate.
2. **Negotiate the download** with PullItemDataRequest (Smart 43 → FileAccess
   1):
   - the exact UUID halves from the listing, as raw fixed64 bytes
   - priority 30, pipe transport 0, offset 0, no compression
   - The response must have result SUCCESS, transport 0 and a transfer
     handle. A compressed transfer is refused.
3. **Configure the read pipe** by sending `00 00 <transfer handle u32 LE>`
   through the reliable channel. The reply `00 <general> <configure>` must be
   `00 00 00`.
4. **Receive** the ordered bytes until the listed size arrives. Inactivity,
   disconnect or a channel failure aborts the download.
5. **Close the pipe** with close-handle request type 2, whatever happened.
6. **Validate** with Garmin's FIT SDK: the size must match the listing, and
   the header, data size and CRC must pass.
   - Activity files are decoded: sport, start, duration, calories, heart rate
     and training effect.
   - A complete file that isn't FIT is remembered as unsupported and not
     imported.
7. **Save** to IndexedDB keyed by device and file UUID, and only then count it
   as synced. Already-synced keys are skipped.

**Reliable channel** (`reliable.ts`):

- **Header:** `byte0 = 0x80 | ((H&7)<<4) | (A>>2)`, `byte1 = ((A&3)<<6) | S`.
- **Sequence space:** 64 for revision 0, 8 for revision 255.
- **ACK-only packets** don't advance the receive sequence.
- **ACKs:** delayed 10 ms, or sent at once after 5 packets. Every data packet
  carries an ACK.
- **Cumulative ACKs** are accepted only inside the sent range, so wraparound
  is safe.
- **Retransmission:** RTO starts at 1 s, adapts with a 500 ms floor and
  doubles up to 20 s. A timeout halves the window and rewinds to resend
  everything unacknowledged. The channel fails after a bounded number of
  timeouts.

**Simulator tests** (`reliable.test.ts`, `bandSync.test.ts`):

- the native oracle vectors, and all 32,768 header combinations
- transfers that wrap the sequence space several times
- dropped data and dropped ACKs, duplicates, and the modulo-8 space
- a peer that goes silent
- a full sync of a real FIT activity built with Garmin's SDK, and a repeat
  sync with no duplicate import
- packet loss mid-transfer
- a disconnect mid-transfer with nothing saved, then recovery on reconnect
- a corrupted file being rejected

**Not yet known, so still unverified on hardware:**

- **Revision:** whether the register response reports the reliable revision.
  BetterGarmin assumes 0, the native default.
- **Close:** the exact close-handle layout. It follows Gadgetbridge.
- **Configure reply:** whether it ever carries file bytes after its three
  status bytes. They're treated as file data if it does.
- **Supported types:** which listed files are activities, and how health,
  sleep and monitoring files map. Only activity FIT files are imported.
- **Incremental listing:** using `next_transaction_id`. It's built, but not
  used yet.

## Alarms

Not implemented. A browser timer that triggers Find My Watch can't be relied on
as a wake-up alarm, because the page may be closed, the phone locked or the
band out of range. The band's stored-alarm protocol needs recovering, then
testing with the phone disconnected, the screen locked and the app closed.
