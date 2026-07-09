import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {config} from 'dotenv';
import {defineConfig, env} from 'prisma/config';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({path: resolve(__dirname, '../../.env')});

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: env('POSTGRES_SERVICE_URI'),
  },
});
