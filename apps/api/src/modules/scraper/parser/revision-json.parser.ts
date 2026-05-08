import { parseHTML } from 'linkedom';
import type { RevisionEvent } from '@sred/shared';
import type { ActivitiesResponse } from '../client/airtable-internal.client.js';

interface ParserLogger {
  debug: (obj: Record<string, unknown>, msg?: string) => void;
}

const IN_SCOPE_FIELDS = new Set(['Status', 'Assignees']);

const CHANGE_GROUP_TYPES = new Set(['cellUpdate', 'apiRowUpdate', 'rowUpdate']);

export interface ParseJsonInput {
  resp: ActivitiesResponse;
  recordId: string;
  baseId: string;
  runId: string;
  logger?: ParserLogger;
}

export interface ParseJsonOutput {
  events: RevisionEvent[];
  ignored: number;
}

export function parseJsonActivities(input: ParseJsonInput): ParseJsonOutput {
  const events: RevisionEvent[] = [];
  let ignored = 0;
  const scrapedAt = new Date().toISOString();

  for (const activity of input.resp.activities) {
    if (!CHANGE_GROUP_TYPES.has(activity.groupType)) {
      ignored++;
      continue;
    }

    const { diffs, usedFallback } = extractFieldDiffs(activity.diffRowHtml ?? '');
    if (diffs.length === 0) {
      ignored++;
      continue;
    }

    const createdDate = new Date(activity.createdTime).toISOString();
    let emittedFromThisActivity = 0;
    for (const diff of diffs) {
      if (!isInScope(diff.field)) continue;
      events.push({
        uuid: diffs.length === 1 ? activity._id : `${activity._id}:${slug(diff.field)}`,
        issueId: input.recordId,
        baseId: input.baseId,
        columnType: diff.field,
        oldValue: diff.from,
        newValue: diff.to,
        createdDate,
        authoredBy: activity.originatingUserId,
        runId: input.runId,
        scrapedAt,
      });
      emittedFromThisActivity++;
    }
    if (emittedFromThisActivity === 0) ignored++;
  }

  return { events, ignored };
}

interface FieldDiff {
  field: string;
  from: string | null;
  to: string | null;
}

function extractFieldDiffs(html: string): { diffs: FieldDiff[]; usedFallback: boolean } {
  if (!html.trim()) return { diffs: [], usedFallback: false };

  try {
    const { document } = parseHTML(html);
    const diffs: FieldDiff[] = [];

    for (const container of document.querySelectorAll('.historicalCellContainer')) {
      // the parsing lib linkedom doesn't reliably match case sensitive
      let field = '';
      for (const el of container.querySelectorAll('*')) {
        if (el.getAttributeNames().some((n: string) => n.toLowerCase() === 'columnid')) {
          field = el.textContent?.trim() ?? '';
          break;
        }
      }
      if (!field) continue;

      const added: string[] = [];
      const removed: string[] = [];

      for (const el of container.querySelectorAll('.foreignRecord')) {
        const cls = el.getAttribute('class') ?? '';
        const title = (el.getAttribute('title') ?? el.textContent ?? '').trim();
        if (!title) continue;
        if (/\badded\b/.test(cls)) added.push(title);
        else if (/\bremoved\b/.test(cls)) removed.push(title);
      }

      for (const chip of container.querySelectorAll('.choiceToken')) {
        const wrap = chip.parentElement;
        const titleEl = chip.querySelector('[title]');
        const title = (titleEl?.getAttribute('title') ?? titleEl?.textContent ?? '').trim();
        if (!title) continue;
        const hasPlus = (wrap?.querySelectorAll('use[href$="#Plus"]').length ?? 0) > 0;
        const hasMinus = (wrap?.querySelectorAll('use[href$="#Minus"]').length ?? 0) > 0;
        const style = chip.getAttribute('style') ?? '';
        const isStruck = /text-decoration\s*:\s*line-through/i.test(style);
        if (hasMinus || isStruck) removed.push(title);
        else if (hasPlus) added.push(title);
      }

      for (const el of container.querySelectorAll('[title]')) {
        if (el.matches('.foreignRecord, .choiceToken')) continue;
        const cls = el.getAttribute('class') ?? '';
        const title = (el.getAttribute('title') ?? '').trim();
        if (!title) continue;
        if (/\badded\b/.test(cls)) added.push(title);
        else if (/\bremoved\b/.test(cls)) removed.push(title);
      }

      const oldValue = removed.length > 0 ? removed.join(', ') : null;
      const newValue = added.length > 0 ? added.join(', ') : null;
      if (oldValue === null && newValue === null) continue;
      diffs.push({ field, from: oldValue, to: newValue });
    }
    if (diffs.length > 0) return { diffs: dedupeDiffs(diffs), usedFallback: false };

    const flat = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const re =
      /(?:changed|updated|set)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{0,60}?)\s+(?:from\s+"?([^"]+?)"?\s+)?to\s+"?([^"]+?)"?(?=[.;]|\s+(?:changed|updated|set|$))/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null) {
      diffs.push({
        field: (m[1] ?? '').trim(),
        from: m[2]?.trim() ?? null,
        to: (m[3] ?? '').trim(),
      });
    }
    return { diffs: dedupeDiffs(diffs), usedFallback: diffs.length > 0 };
  } catch {
    return { diffs: [], usedFallback: false };
  }
}

function dedupeDiffs(diffs: FieldDiff[]): FieldDiff[] {
  const seen = new Set<string>();
  const out: FieldDiff[] = [];
  for (const d of diffs) {
    const key = `${d.field}|${d.from ?? ''}|${d.to ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function isInScope(field: string): boolean {
  return IN_SCOPE_FIELDS.has(field);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
