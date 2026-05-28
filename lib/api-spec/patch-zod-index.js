const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../../lib/api-zod/src/index.ts');
const apiPath = path.resolve(__dirname, '../../lib/api-zod/src/generated/api.ts');
const typesIndexPath = path.resolve(__dirname, '../../lib/api-zod/src/generated/types/index.ts');

// Get all value exports from api.ts (zod schema names)
const apiContent = fs.readFileSync(apiPath, 'utf8');
const zodExports = new Set();
const matches = apiContent.matchAll(/^export const (\w+)/gm);
for (const m of matches) zodExports.add(m[1]);

// Get all exports from types/index.ts
const typesContent = fs.readFileSync(typesIndexPath, 'utf8');

// Find all type names exported from types files
const typeNames = [];
const typeDir = path.resolve(__dirname, '../../lib/api-zod/src/generated/types');
const typeFiles = fs.readdirSync(typeDir).filter(f => f !== 'index.ts' && f.endsWith('.ts'));
for (const file of typeFiles) {
  const content = fs.readFileSync(path.join(typeDir, file), 'utf8');
  const nameMatches = content.matchAll(/^export type (\w+)/gm);
  for (const m of nameMatches) {
    if (!zodExports.has(m[1])) {
      typeNames.push(m[1]);
    }
  }
}

// Rewrite index.ts with explicit non-conflicting type exports
const newIndex = `export * from "./generated/api";\nexport type {\n${typeNames.map(n => `  ${n}`).join(',\n')}\n} from "./generated/types";\n`;
fs.writeFileSync(indexPath, newIndex);
console.log('Patched lib/api-zod/src/index.ts - excluded conflicting types:', [...zodExports].filter(n => typeNames.every(t => t !== n)));
