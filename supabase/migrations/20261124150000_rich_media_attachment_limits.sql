-- Expand private messaging attachments to common audio/video formats.
-- Enforce the same 10 MB limit at the Storage bucket, independent of client validation.
-- Candidate migration only: replay in isolated staging after migration-history reconciliation.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'video/mp4',
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/wav'
    ]::text[]
where id = 'message-attachments';
