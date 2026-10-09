-- Allow stories up to 30 minutes (about 5 GB of 4K phone video).
update storage.buckets set file_size_limit = 8589934592 where id = 'story-videos';
