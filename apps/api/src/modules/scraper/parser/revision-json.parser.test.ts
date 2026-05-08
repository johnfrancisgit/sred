import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJsonActivities, type ParseJsonInput } from './revision-json.parser.js';
import type { ActivitiesResponse } from '../client/airtable-internal.client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): ActivitiesResponse =>
  JSON.parse(
    readFileSync(path.join(__dirname, '__fixtures__/json', name), 'utf-8'),
  ) as ActivitiesResponse;

const baseInput = (resp: ActivitiesResponse): ParseJsonInput => ({
  resp,
  recordId: 'record123',
  baseId: 'base123',
  runId: 'run123',
});

describe('parseJsonActivities', () => {
  it('extracts a Assignee change', () => {
    const out = parseJsonActivities(baseInput(fixture('assignee-change.json')));
    expect(out.events).toHaveLength(1);
    const e = out.events[0]!;
    expect(Object.keys(e).sort()).toEqual(
      [
        'authoredBy',
        'baseId',
        'columnType',
        'createdDate',
        'issueId',
        'newValue',
        'oldValue',
        'runId',
        'scrapedAt',
        'uuid',
      ].sort(),
    );
    expect(e.uuid).toBe('activity1');
    expect(e.issueId).toBe('record123');
    expect(e.columnType).toBe('Assignees');
    expect(e.oldValue).toBeNull();
    expect(e.newValue).toBe('Alice');
    expect(e.authoredBy).toBe('Bob');
    expect(new Date(e.createdDate).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('extracts a Status change', () => {
    const out = parseJsonActivities(baseInput(fixture('status-change.json')));
    expect(out.events).toHaveLength(1);
    const e = out.events[0]!;
    expect(e.uuid).toBe('activity2');
    expect(e.columnType).toBe('Status');
    expect(e.oldValue).toBe('Open');
    expect(e.newValue).toBe('In Progress');
  });
});
