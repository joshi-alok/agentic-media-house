import type { APIContext } from 'astro';
import { robotsTxt } from '../lib/robots';

export function GET(context: APIContext) {
  if (context.site === undefined) throw new Error('site/astro.config.mjs must set `site`');
  return new Response(robotsTxt(context.site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
