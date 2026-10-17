import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mergePrices, mergeDiagnostics } from './merge-results.mjs';

const collected = JSON.parse(await readFile('data/prices.json', 'utf8'));
const results = JSON.parse(await readFile('diagnostics/results.json', 'utf8'));
const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

git('config', 'user.name', 'github-actions[bot]');
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
for (let attempt = 1; attempt <= 3; attempt++) {
  git('fetch', 'origin', 'main');
  const remote = JSON.parse(git('show', 'origin/main:data/prices.json'));
  const remoteResults = JSON.parse(git('show', 'origin/main:data/diagnostics.json'));
  const prices = mergePrices(remote, collected);
  const diagnostics = mergeDiagnostics(remoteResults, results);
  git('reset', '--hard', 'origin/main');
  await writeFile('data/prices.json', JSON.stringify(prices, null, 2) + '\n');
  await writeFile('data/diagnostics.json', JSON.stringify(diagnostics, null, 2) + '\n');
  git('add', 'data/prices.json', 'data/diagnostics.json');
  if (!git('diff', '--cached', '--name-only').trim()) break;
  git('commit', '-m', 'Record flight collection attempts and verified prices');
  try {
    git('push', 'origin', 'main');
    break;
  } catch (error) {
    if (attempt === 3) throw error;
  }
}
