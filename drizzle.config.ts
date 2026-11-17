import { defineConfig } from 'drizzle-kit'

// Used only to generate migration files: npm run db:generate
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
})
