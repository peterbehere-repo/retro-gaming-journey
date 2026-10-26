// Retro Gaming Journey — backend configuration.
// Create a free Supabase project (https://supabase.com), run supabase/schema.sql in the
// SQL editor, then paste your project URL and anon public key here. Until then the app
// runs fully offline: progress is stored in this browser's localStorage.
"use strict";

const SUPABASE_CONFIG = {
  url: "",            // e.g. "https://your-project.supabase.co"
  anonKey: "",        // e.g. "eyJhbGciOi..." (anon/public key — safe for the browser)
  deviceId: "rgb10x_hw01"
};

const SUPABASE_CONFIGURED = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
