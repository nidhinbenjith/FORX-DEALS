import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const files = ['index.html', 'styles.css', 'light-theme.css', 'app.js', 'catalog.json'];

await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});

for (const file of files) {
  await cp(join(root, file), join(output, file));
}

const indexPath = join(output, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
await writeFile(indexPath, indexHtml.replace(/<a class="admin-link" href="\/admin\.html">[\s\S]*?<\/a>/, ''), 'utf8');

try {
  await cp(join(root, 'uploads'), join(output, 'uploads'), {recursive:true});
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

console.log(`Built static Netlify site at ${output}`);
