import {defineConfig} from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  dbCredentials: {
    url: './prisma/sqlite.db',
  },
});
