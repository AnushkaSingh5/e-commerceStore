// scratch/check-env.mjs
import path from 'path';
import fs from 'fs';

function inspectEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        const isPresent = val.length > 0;
        const masked = isPresent ? (val.length > 8 ? val.slice(0, 4) + '...' + val.slice(-4) : '***') : '<EMPTY>';
        console.log(`${key}: ${isPresent ? 'PRESENT (' + masked + ')' : 'MISSING'}`);
      }
    }
  } else {
    console.log('.env.local does not exist');
  }
}

inspectEnv();
