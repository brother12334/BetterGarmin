# Garmin band protocol (CIRQA)

How BetterGarmin talks directly to a Garmin CIRQA band over Web Bluetooth, and
what has and hasn't been verified on a real device. The code lives in
`src/lib/band/`; `band.test.ts` checks every byte string below.

## Status

| Feature | Status |
| --- | --- |
| Connect, MultiLink registration, GFDI handshake | ✅ Verified on a CIRQA (60-second connection check passed) |
| Start Strength (10/20), pause, resume, save | ✅ Verified: the band reported matching events, and the saved workout appeared in Garmin Connect |
| Discard | ⚠️ Derived from the command enum, not physically tested. The app asks for confirmation first. |
| Test band alert (Find My Watch) | ✅ Physical alert confirmed. Cancelling isn't verified. |
| File listing | ✅ Verified (17 references over two pages) |
| File download and import | ❌ Not implemented. The reliable transfer pipe hasn't been exercised. |
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

Handshake, after registration:

1. The band sends Device Information (5024). The host replies with an ACK
   carrying its own information: protocol 113, name `BetterGarmin`.
2. The band sends Configuration (5050). The host acknowledges it, then sends its
   own configuration with bits 9, 81, 95 and 105.
3. The band acknowledges the host configuration, and the session is ready.

No app-authentication exchange was needed on the tested band. That may not hold
for every device or pairing state.

Protobuf transport (5043/5044): u16 request ID, u32 offset, u32 total length,
u32 fragment length, then the bytes. Responses are matched by request ID and
expected message type. Every incoming protobuf message is acknowledged with its
request ID and offset.

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

### How commands are tracked

A command moves through three stages: **sent** (written to Bluetooth),
**accepted** (a LiveSession 18 response arrived for its request ID) and
**confirmed** (the band then reported a LiveSession event). A transport ACK
alone never counts as accepted.

Event payloads are decoded generically: field numbers and values are shown in
the protocol log, and enum names (START, WORKOUT_ACTIVE, STOP, SAVING, ENDED…)
aren't mapped yet. Any UUID found in the response or events is stored on the
workout as `bandActivityUuid`.

## Direct sync (experimental)

Implemented: listing, with generic decoding of each page, continuation while a
session ID comes back, and the final page's fields kept for a future
incremental listing (`next_transaction_id`). Files on the band are never
deleted or marked as synced.

Located, but not implemented or exercised:

- **PullItemDataRequest** (FileAccess 1, response 2): built in `smart.ts` but
  never sent. It only negotiates a transfer.
- **Reliable MultiLink pipe:** a separate service from the pool `0x2018,
  0x4018 … 0xE018`, configured with `00 00 <transfer handle u32 LE>`.
  Reliable framing, sequencing, acknowledgments, retransmission and
  compression all need to be implemented and verified before any real file is
  downloaded.

Full sync stays labelled experimental until a file is downloaded, checked
(size and FIT integrity), deduplicated by stable device/file IDs, saved, and
only then marked imported.

## Alarms

Not implemented. A browser timer that triggers Find My Watch can't be relied on
as a wake-up alarm, because the page may be closed, the phone locked or the
band out of range. The band's stored-alarm protocol needs recovering, then
testing with the phone disconnected, the screen locked and the app closed.
