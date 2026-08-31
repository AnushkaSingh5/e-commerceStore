// scratch/check-shiprocket-env.mjs
import path from 'path';
import fs from 'fs';
import { ShiprocketProvider } from '../services/shipping/shiprocketProvider.js';

function safeDiagnostic() {
  const p = path.resolve(process.cwd(), '.env.local');
  console.log('--- ENV FILE CHECK ---');
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    const lines = content.split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key.includes('SHIPROCKET') || key.includes('SHIPPING')) {
          console.log(`Env Key: "${key}"`);
          console.log(`  Value exists: ${val.length > 0}`);
          console.log(`  Raw length: ${val.length}`);
          console.log(`  Starts with quote: ${val.startsWith('"') || val.startsWith("'")}`);
          console.log(`  Ends with quote: ${val.endsWith('"') || val.endsWith("'")}`);
        }
      }
    }
  }

  console.log('\n--- SHIPROCKET PROVIDER INSTANCE CHECK ---');
  // Load env in process.env like Next.js does
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) {
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        process.env[key] = val;
      }
    }
  }

  const provider = new ShiprocketProvider();
  console.log(`Provider email configured: ${Boolean(provider.email)} (length: ${provider.email?.length})`);
  console.log(`Provider password configured: ${Boolean(provider.password)} (length: ${provider.password?.length})`);
  console.log(`Provider isMock: ${provider.isMock}`);
}

safeDiagnostic();
