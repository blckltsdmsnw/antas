-- A fingerprint of the photograph, so the same image cannot be sent twice
-- without a moderator being told.
--
-- The live capture already makes an SOS photo hard to fake: the page draws a
-- frame from the camera onto a canvas rather than accepting a file. But
-- `capture="environment"` is a hint browsers may ignore, and a determined
-- sender can bypass the page and post to the API directly. Reuse of one image
-- across several signals is the clearest evidence of fabrication a moderator
-- could be handed, and until now nothing looked for it.
--
-- WHAT THIS CATCHES, EXACTLY: identical bytes. Somebody saving a flood photo
-- and submitting it again, or the same file spread across several accounts.
--
-- WHAT IT DOES NOT CATCH: the same picture re-encoded, resized, cropped or
-- screenshotted - all of which change every byte. Catching those needs a
-- perceptual hash, which needs decoding the image, which needs an image library
-- this project does not have. The limit is stated here rather than left for
-- somebody to discover when a re-saved photo sails through.
--
-- ALSO NOT ATTEMPTED: reading camera metadata to spot screenshots. The SOS
-- photo is produced by `canvas.toBlob`, and canvas output carries no EXIF at
-- all - so every genuine SOS photo would look like a screenshot. A check that
-- flags every honest signal is worse than no check, because a moderator learns
-- to ignore it.

alter table sos_signals add column photo_sha256 text;

-- Lowercase hex of a SHA-256, or nothing. Written only by the server during
-- enrichment; `authenticated` has no UPDATE on this table at all, so a sender
-- cannot supply or alter their own fingerprint.
alter table sos_signals add constraint sos_signals_photo_sha256_hex
  check (photo_sha256 is null or photo_sha256 ~ '^[0-9a-f]{64}$');

-- The lookup is "has this exact image been sent before", so the index is on the
-- hash alone and is deliberately not unique - a repeat is the thing being
-- recorded, not something to reject.
create index sos_signals_photo_sha256_idx
  on sos_signals (photo_sha256)
  where photo_sha256 is not null;
