#!/usr/bin/env node
import { builtinModules } from 'node:module';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';
import { build } from 'tsdown';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = process.cwd();
const manifest = readJson(join(packageDir, 'package.json'));
const packageProfile = resolvePackageProfile(packageDir, manifest);
const nodeBuildTarget = resolveNodeBuildTarget(repoRoot);
const entries = deriveEntries(packageDir, manifest);

const NODE_BUILTINS = new Set(
  builtinModules.map((name) => (name.startsWith('node:') ? name.slice('node:'.length) : name)),
);

if (Object.keys(entries).length === 0) {
  throw new Error(`${manifest.name ?? packageDir} has no buildable package exports.`);
}

if (packageProfile === 'neutral') {
  validateNeutralSource(packageDir, manifest);
}

await build({
  cwd: packageDir,
  entry: entries,
  root: 'src',
  outDir: 'dist',
  clean: true,
  format: 'esm',
  platform: packageProfile === 'node' ? 'node' : 'neutral',
  target: packageProfile === 'node' ? nodeBuildTarget : 'es2024',
  fixedExtension: false,
  sourcemap: true,
  dts: {
    resolver: 'tsc',
    sourcemap: false,
  },
  deps: {
    neverBundle: true,
  },
  failOnWarn: true,
  report: false,
  tsconfig: 'tsconfig.json',
});

await validateSurface(packageDir, manifest, packageProfile);

function resolvePackageProfile(cwd, pkg) {
  const configPath = join(cwd, 'tsconfig.json');
  const config = readJson(configPath);
  if (typeof config.extends !== 'string') {
    throw new Error(
      `${pkg.name}: tsconfig.json must directly extend a repository package profile.`,
    );
  }

  const extendedConfig = resolve(dirname(configPath), config.extends);
  const neutralConfig = join(repoRoot, 'tsconfig.package-neutral.json');
  const nodeConfig = join(repoRoot, 'tsconfig.package-node.json');

  if (extendedConfig === neutralConfig) {
    if (typeof pkg.engines?.node === 'string') {
      throw new Error(
        `${pkg.name}: neutral packages must not declare engines.node; use tsconfig.package-node.json for Node-only packages.`,
      );
    }
    return 'neutral';
  }

  if (extendedConfig === nodeConfig) {
    if (typeof pkg.engines?.node !== 'string') {
      throw new Error(
        `${pkg.name}: Node packages must declare engines.node alongside tsconfig.package-node.json.`,
      );
    }
    return 'node';
  }

  throw new Error(
    `${pkg.name}: tsconfig.json must directly extend tsconfig.package-neutral.json or tsconfig.package-node.json.`,
  );
}

function deriveEntries(cwd, pkg) {
  const entries = {};
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error(`${pkg.name}: export '${subpath}' must use { types, default } conditions.`);
    }

    const runtimeTarget = target.default;
    const typeTarget = target.types;
    if (typeof runtimeTarget !== 'string' || typeof typeTarget !== 'string') {
      throw new Error(`${pkg.name}: export '${subpath}' must define string types/default targets.`);
    }
    if (!runtimeTarget.startsWith('./dist/') || !runtimeTarget.endsWith('.js')) {
      throw new Error(`${pkg.name}: export '${subpath}' default target must be ./dist/*.js.`);
    }
    if (!typeTarget.startsWith('./dist/') || !typeTarget.endsWith('.d.ts')) {
      throw new Error(`${pkg.name}: export '${subpath}' types target must be ./dist/*.d.ts.`);
    }

    const runtimeStem = runtimeTarget.slice('./dist/'.length, -'.js'.length);
    const typeStem = typeTarget.slice('./dist/'.length, -'.d.ts'.length);
    if (runtimeStem !== typeStem) {
      throw new Error(
        `${pkg.name}: export '${subpath}' types/default targets must share one stem.`,
      );
    }

    const source = findSource(cwd, runtimeStem);
    entries[runtimeStem] = source;
  }
  return entries;
}

function findSource(cwd, stem) {
  for (const extension of ['.ts', '.tsx', '.mts', '.cts']) {
    const candidate = join(cwd, 'src', `${stem}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`No source entry found for dist/${stem}.js.`);
}

function validateNeutralSource(cwd, pkg) {
  const sourceFiles = [];
  collectMatchingFiles(join(cwd, 'src'), sourceFiles, (name) =>
    /\.(?:ts|tsx|mts|cts)$/u.test(name),
  );

  for (const file of sourceFiles) {
    rejectNodeBuiltinImports(file, pkg.name);
  }
}

async function validateSurface(cwd, pkg, profile) {
  const declarationFiles = [];
  const runtimeFiles = [];
  collectMatchingFiles(join(cwd, 'dist'), declarationFiles, (name) => name.endsWith('.d.ts'));
  collectMatchingFiles(join(cwd, 'dist'), runtimeFiles, (name) => name.endsWith('.js'));

  for (const file of declarationFiles) {
    rejectExtensionlessDeclarationImports(file);
  }

  if (profile === 'neutral') {
    for (const file of [...runtimeFiles, ...declarationFiles]) {
      rejectNodeBuiltinImports(file, pkg.name);
    }
  }

  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    const runtimeFile = resolveTarget(cwd, target.default, subpath, 'default');
    resolveTarget(cwd, target.types, subpath, 'types');
    await import(`${pathToFileURL(runtimeFile).href}?surface-check=${Date.now()}`);
  }

  verifyNodeNextDeclarations(cwd, pkg, profile);
}

function resolveTarget(cwd, target, subpath, condition) {
  if (typeof target !== 'string') {
    throw new Error(`${condition} export '${subpath}' must be a string.`);
  }
  const absolute = resolve(cwd, target);
  if (!existsSync(absolute)) {
    throw new Error(`Missing ${condition} output for export '${subpath}': ${target}`);
  }
  return absolute;
}

function collectMatchingFiles(dir, out, matches) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectMatchingFiles(path, out, matches);
    else if (entry.isFile() && matches(entry.name)) out.push(path);
  }
}

function rejectExtensionlessDeclarationImports(file) {
  for (const specifier of moduleSpecifiers(file, readFileSync(file, 'utf8'))) {
    if (!specifier.startsWith('.')) continue;
    if (!extname(specifier)) {
      throw new Error(`Extensionless relative declaration import in ${file}: ${specifier}`);
    }
  }
}

function rejectNodeBuiltinImports(file, packageName) {
  for (const specifier of moduleSpecifiers(file, readFileSync(file, 'utf8'))) {
    if (!isNodeBuiltin(specifier)) continue;
    throw new Error(
      `${packageName}: neutral package imports Node builtin '${specifier}' in ${relative(packageDir, file)}.`,
    );
  }
}

function isNodeBuiltin(specifier) {
  const normalized = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return NODE_BUILTINS.has(normalized) || NODE_BUILTINS.has(normalized.split('/')[0]);
}

function moduleSpecifiers(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const specifiers = [];

  const addLiteral = (node) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      addLiteral(node.arguments[0]);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument)) addLiteral(argument.literal);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return specifiers;
}

function scriptKindFor(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function resolveNodeBuildTarget(root) {
  const version = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  const match = /^v?(\d+)(?:\.|$)/u.exec(version);
  if (!match?.[1]) {
    throw new Error(`Could not derive the Node build target from .nvmrc: ${version}`);
  }
  return `node${match[1]}`;
}

function verifyNodeNextDeclarations(cwd, pkg, profile) {
  const tempDir = mkdtempSync(join(tmpdir(), 'nevo-package-surface-'));
  try {
    const consumer = join(tempDir, 'consumer.mts');
    const imports = Object.values(pkg.exports ?? {}).map((target, index) => {
      const runtimeFile = resolve(cwd, target.default);
      let specifier = relative(tempDir, runtimeFile).split(sep).join('/');
      if (!specifier.startsWith('.')) specifier = `./${specifier}`;
      return `import * as Entry${index} from ${JSON.stringify(specifier)}; void Entry${index};`;
    });
    writeFileSync(consumer, `${imports.join('\n')}\n`);

    const configPath = join(cwd, 'tsconfig.json');
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) throw new Error(formatDiagnostics([read.error]));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, cwd);
    const options = {
      ...parsed.options,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      declaration: false,
      declarationMap: false,
      composite: false,
      incremental: false,
      tsBuildInfoFile: undefined,
      rootDir: undefined,
      outDir: undefined,
      paths: undefined,
      baseUrl: undefined,
      types: profile === 'node' ? ['node'] : [],
    };

    const program = ts.createProgram([consumer], options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      throw new Error(
        `${pkg.name}: generated declarations fail a NodeNext consumer check:\n${formatDiagnostics(diagnostics)}`,
      );
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
