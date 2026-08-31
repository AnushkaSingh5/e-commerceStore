// scratch/audit-sr-auth.mjs
import path from 'path';
import fs from 'fs';

function auditEnvFiles() {
  console.log('====================================================');
  console.log('🔍 SHIPROCKET ENVIRONMENT & AUTHENTICATION AUDIT');
  console.log('====================================================\n');

  const root = process.cwd();
  const files = ['.env', '.env.local', '.env.production', '.env.development'];

  for (const f of files) {
    const fullPath = path.join(root, f);
    if (fs.existsSync(fullPath)) {
      console.log(`📄 Found file: ${f}`);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1);
          if (key.toUpperCase().includes('SHIPROCKET') || key.toUpperCase().includes('SHIPPING')) {
            console.log(`  Line ${i + 1}: Key = "${key}"`);
            console.log(`    Value exists: ${val.length > 0}`);
            console.log(`    Raw character length: ${val.length}`);
            console.log(`    Has leading/trailing whitespace: ${val !== val.trim()}`);
            console.log(`    Starts with quote: ${val.trim().startsWith('"') || val.trim().startsWith("'")}`);
            console.log(`    Ends with quote: ${val.trim().endsWith('"') || val.trim().endsWith("'")}`);
            console.log(`    Contains special characters: ${/[^a-zA-Z0-9_@.-]/.test(val.trim().replace(/^["']|["']$/g, ''))}`);
          }
        }
      }
    } else {
      console.log(`❌ File not present: ${f}`);
    }
  }
}

auditEnvFiles();
