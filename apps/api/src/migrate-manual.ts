import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl });
  try {
    console.log('Altering WhatsappSession table if needed...');
    await pool.query(`
      ALTER TABLE "WhatsappSession" 
      ADD COLUMN IF NOT EXISTS "phone" TEXT,
      ADD COLUMN IF NOT EXISTS "meJid" TEXT,
      ADD COLUMN IF NOT EXISTS "pairingCode" TEXT,
      ADD COLUMN IF NOT EXISTS "webhookEvents" TEXT[] DEFAULT ARRAY['all']::TEXT[],
      ADD COLUMN IF NOT EXISTS "botEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "botConfig" JSONB;
    `);
    console.log('WhatsappSession table altered successfully.');
  } catch (err) {
    console.error('Error altering table:', err);
  } finally {
    await pool.end();
  }
}

run();
