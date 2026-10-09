-- Visitors can create a profile with these fields (status, approved_at stay at their defaults).
grant insert (id, display_name, branch, component, eras, years_served, contact_email, consent,
              photo_path, rank, unit, job, duty_stations, deployments, awards, hometown, after_service, bio)
  on public.veterans to anon, authenticated;

-- Anyone can submit, but only as a pending profile with consent given.
create policy "Anyone can submit a pending profile" on public.veterans
  for insert to anon, authenticated
  with check (status = 'pending' and approved_at is null and consent = true);
