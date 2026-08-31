// scratch/loader.mjs
import path from 'path';
import fs from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';

export async function resolve(specifier, context, nextResolve) {
  const root = process.cwd();
  
  if (specifier === 'next/server') {
    const nextServerPath = path.join(root, 'node_modules/next/server.js');
    if (fs.existsSync(nextServerPath)) {
      return nextResolve(pathToFileURL(nextServerPath).href, context);
    }
  }

  if (specifier.startsWith('@/')) {
    let target = path.join(root, specifier.slice(2));
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.js');
    } else if (!target.endsWith('.js') && !target.endsWith('.json')) {
      if (fs.existsSync(target + '.js')) {
        target = target + '.js';
      }
    }
    return nextResolve(pathToFileURL(target).href, context);
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : root;
    let target = path.resolve(parentDir, specifier);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.js');
    } else if (!target.endsWith('.js') && !target.endsWith('.json')) {
      if (fs.existsSync(target + '.js')) {
        target = target + '.js';
      }
    }
    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}
