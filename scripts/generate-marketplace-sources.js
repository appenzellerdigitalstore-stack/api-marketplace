'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'api-market-sources-min');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function pascalOperationId(slug) {
  return slug.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function cleanDescription(description, suffix) {
  return String(description || '')
    .replace(/Send a JSON POST request through api\.market and receive a structured JSON response\./gi, 'Send a JSON POST request and receive a structured JSON response.')
    .replace(/Pricing, quotas, and authentication are handled by api\.market plans\./gi, suffix)
    .replace(/api\.market/gi, 'the marketplace')
    .replace(/RapidAPI|X-RapidAPI|X-Plan/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function applyExample(spec, slug, exampleOverride) {
  const route = Object.keys(spec.paths)[0];
  const method = Object.keys(spec.paths[route])[0];
  const operation = spec.paths[route][method];
  const jsonContent = operation.requestBody && operation.requestBody.content && operation.requestBody.content['application/json'];
  if (!jsonContent || !exampleOverride) return;

  jsonContent.example = { ...jsonContent.example, ...exampleOverride };
  if (jsonContent.schema && jsonContent.schema.properties) {
    for (const [key, value] of Object.entries(exampleOverride)) {
      if (jsonContent.schema.properties[key]) jsonContent.schema.properties[key].example = value;
    }
  }
  operation.operationId = operation.operationId || pascalOperationId(slug);
}

function addHeaderParameters(spec, headers) {
  if (!headers || headers.length === 0) return;
  const route = Object.keys(spec.paths)[0];
  const method = Object.keys(spec.paths[route])[0];
  const operation = spec.paths[route][method];
  operation.parameters = operation.parameters || [];

  for (const header of headers) {
    if (operation.parameters.some((param) => param.in === 'header' && param.name === header.name)) continue;
    operation.parameters.push({
      name: header.name,
      in: 'header',
      required: Boolean(header.required),
      description: header.description,
      schema: { type: 'string' }
    });
  }
}

function transformSpec(spec, slug, config) {
  const clone = JSON.parse(JSON.stringify(spec));
  clone.servers = [{ url: config.baseUrl, description: `${config.marketplace} production base URL` }];
  clone.info.description = cleanDescription(clone.info.description, config.descriptionSuffix);

  const route = Object.keys(clone.paths)[0];
  const method = Object.keys(clone.paths[route])[0];
  const operation = clone.paths[route][method];
  operation.description = cleanDescription(operation.description, config.descriptionSuffix);
  applyExample(clone, slug, config.examples && config.examples[slug]);
  addHeaderParameters(clone, config.headers);

  return clone;
}

function main() {
  const marketplace = process.argv[2];
  if (!marketplace) {
    throw new Error('Usage: node scripts/generate-marketplace-sources.js <rapidapi|zyla|api-market>');
  }

  const configPath = path.join(root, 'marketplace-config', `${marketplace}.json`);
  const config = readJson(configPath);
  const outDir = path.join(root, `${marketplace}-sources`);
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    const spec = readJson(path.join(sourceDir, file));
    writeJson(path.join(outDir, file), transformSpec(spec, slug, config));
  }

  console.log(`Generated ${files.length} ${marketplace} OpenAPI specs in ${path.relative(root, outDir)}`);
}

main();
