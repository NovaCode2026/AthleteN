-- The release bucket should not add a second, lower file-size restriction.
-- Supabase's project-wide Storage limit remains authoritative (50 MB on the current Free plan).
update storage.buckets
set file_size_limit = null
where id = 'mobile-release-apks';
