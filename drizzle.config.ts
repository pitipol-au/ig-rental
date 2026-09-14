// drizzle.config.ts
//
// Goes in the PROJECT ROOT, next to package.json.
//
// This only tells drizzle-kit where the schema is and how to reach the
// database. The app itself never reads it.
//
// ─────────────────────────────────────────────────────────────
// WHY THE EXPLICIT .env.local
//
// Next.js reads .env.local automatically. Plain `dotenv/config` does
// NOT — it only looks for a file called `.env`. So a DATABASE_URL
// sitting in .env.local is invisible to drizzle-kit, dotenv finds
// nothing and says nothing, and the only symptom is drizzle-kit
// reporting that the connection url is missing.
//
// Both files are loaded below, .env.local first. dotenv does not
// overwrite a variable that is already set, so .env.local wins and
// .env is a fallback — which also means this works whichever file
// you happened to put the URL in.
// ─────────────────────────────────────────────────────────────

import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// quiet: true suppresses dotenv's startup banner. Harmless on older
// versions that don't know the option.
config({ path: '.env.local', quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL;

if (!url) {
  // A specific message beats drizzle-kit's generic one, which says
  // the url is required but not that it looked in the environment and
  // found nothing.
  throw new Error(
    'DATABASE_URL is not set.\n\n' +
    'Add it to .env.local in the project root, on one line, with no quotes:\n' +
    '  DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require\n\n' +
    'Then run npm run db:push again.'
  );
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});