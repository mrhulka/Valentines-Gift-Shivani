/* Robobox Connect - where the data lives.
 *
 * Empty = this browser only, which is the demo. Every person gets their own
 * private copy and nobody sees anybody else's work - fine for a walkthrough,
 * useless as a system of record.
 *
 * Fill these two in and the app switches to the shared database instead: one
 * set of records, everyone sees the same thing. Both values are safe in the
 * page - the anon key grants nothing on its own, because every table is behind
 * row-level security that checks who is signed in (supabase/schema.sql).
 * The service-role key is the one that must never appear here.
 */
window.RB = window.RB || {};

RB.config = {
  supabaseUrl: '',      // e.g. https://abcdefghijkl.supabase.co
  supabaseAnonKey: ''   // Project Settings -> API -> anon / public
};
