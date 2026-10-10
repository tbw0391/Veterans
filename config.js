// Public Supabase settings. The anon key is meant to be public;
// the database's row-level security rules decide what it can do.
window.STORIES_CONFIG = {
  supabaseUrl: "https://ajftnvdgkuvjkflswxrp.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZnRudmRna3V2amtmbHN3eHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NTc2MzMsImV4cCI6MjEwNzEzMzYzM30.PFpujdcsQRobd3s7GrjzMI5wlLrUssMsePORh_Szl_s",
  bucket: "story-videos",
  // Longest story we take, and the biggest file. 30 minutes of 4K phone
  // video is about 5 GB. Raise both together (and the bucket limit in Supabase).
  maxMinutes: 30,
  maxBytes: 8 * 1024 * 1024 * 1024,
  // Stripe Payment Link for the Donate button. Leave empty to hide the button.
  donateUrl: "https://buy.stripe.com/14AaEZ7SW82jgTDb80ew801"
};
