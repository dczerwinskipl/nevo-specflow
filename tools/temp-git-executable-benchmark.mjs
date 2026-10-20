import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Diagnostic only: compare PATH Git (usually cmd/git.exe wrapper) with
// the actual bundled Git binary. Neither test changes Engine execution.
const values = [];
function cmd(binary, args, cwd, env = process.env) {
  return execFileSync(binary, args, {
    cwd, env, encoding: 'utf8', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1_000_000,
  }).trim();
}
const gitPaths = cmd('where.exe', ['git']).split(/\r?\n/u).map(x => x.trim()).filter(Boolean);
const candidates = [
  ['path', 'git'],
  ['ucrt64', 'C:\\Program Files\\Git\\ucrt64\\bin\\git.exe'],
  ['mingw64', 'C:\\Program Files\\Git\\mingw64\\bin\\git.exe'],
];
for (const wrapper of gitPaths) {
  if (wrapper.toLowerCase().includes('\\cmd\\') && !candidates.some(x => x[1].toLowerCase() === wrapper.toLowerCase())) {
    candidates.push(['cmd', wrapper]);
  }
}
const unique = candidates.filter((x, i) => x[1] === 'git' || (existsSync(x[1]) && candidates.findIndex(y => y[1] === x[1]) === i));
function measure(label, binary, args, cwd, n) {
  const measurements = [];
  for (let i = 0; i < n + 5; i++) {
    const start = performance.now();
    cmd(binary, args, cwd);
    const elapsed = performance.now() - start;
    if (i >= 5) measurements.push(elapsed);
  }
  measurements.sort((a,b) => a-b);
  const percentile = p => +measurements[Math.floor((measurements.length - 1) * p)].toFixed(2);
  const row = {label, n, medianMs: percentile(.5), p95Ms: percentile(.95), minMs:percentile(0), maxMs:percentile(1)};
  values.push(row);
  console.log('[measure]', JSON.stringify(row));
}
const root = mkdtempSync(join(tmpdir(), 'specflow-git-executable-'));
const repo = join(root, 'fixture');
try {
  mkdirSync(repo);
  cmd('git', ['init', '-q'], repo);
  cmd('git', ['config', '--local', 'core.autocrlf', 'false'], repo);
  writeFileSync(join(repo, 'test.txt'), 'alpha\n');
  cmd('git', ['add', 'test.txt'], repo);
  cmd('git', ['-c','user.name=Benchmark','-c','user.email=b@example.invalid','commit','-qm','base'], repo);
  console.log('[environment]',JSON.stringify({
    platform:process.platform, arch:process.arch, node:process.version,
    osVersion:process.env.ImageOS, imageVersion:process.env.ImageVersion,
    gitPaths,
    candidates:unique.map(([name,exe])=>({name,exe,version:cmd(exe,['--version'],repo)})),
  }));
  for(const [name,binary] of unique){
    measure(name + '/version',binary,['--version'],repo,80);
    measure(name + '/rev-parse',binary,['rev-parse','HEAD'],repo,80);
    measure(name + '/status',binary,['status','--porcelain'],repo,60);
  }
  for(const cache of ['false','true']){
    cmd('git',['config','--local','core.fscache',cache],repo);
    measure('wrapper/fscache='+cache+'/status','git',['status','--porcelain'],repo,60);
  }
  for(const [name,binary] of unique){
    const trace = execFileSync(binary,['--version'],{
      cwd:repo,env:{...process.env,GIT_TRACE2_PERF:'1'},
      encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']
    });
    // Trace to stderr is easiest to inspect for a single traced child, so
    // capture separately here and avoid tracing the timed measurements.
    const traceResult = await import('node:child_process').then(
      m => m.spawnSync(binary,['--version'],{cwd:repo,env:{...process.env,GIT_TRACE2_PERF:'1'},encoding:'utf8',windowsHide:true})
    );
    console.log('[trace]',name,JSON.stringify({result:trace.trim(),excerpt:(traceResult.stderr||'').slice(0,1600)}));
  }
  console.log('[summary]',JSON.stringify(values));
} finally {
  rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:250});
}
