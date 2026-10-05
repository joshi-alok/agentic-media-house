import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { SourcesRegistry } from './schemas';

/**
 * Parse the text of sources.yml and validate it against `SourcesRegistry`.
 * Throws a YAMLParseError for text that is not valid YAML (including duplicate
 * keys) and a ZodError for YAML that is not a valid registry.
 */
export function parseSources(yamlText: string): SourcesRegistry {
  return SourcesRegistry.parse(parse(yamlText));
}

/** Read the file at `path` and validate it with `parseSources`. */
export function loadSources(path: string): SourcesRegistry {
  return parseSources(readFileSync(path, 'utf8'));
}
