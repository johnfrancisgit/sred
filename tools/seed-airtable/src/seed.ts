import { createHash } from 'node:crypto';

const TOKEN = process.env['SEED_AIRTABLE_PAT'];
const BASE_ID = process.env['SEED_AIRTABLE_BASE_ID'];
const USERS = 20;
const TASKS = 220;
const MUTATIONS = 50;
const SEED = 42;

if (!TOKEN || !BASE_ID) {
  console.error('Missing SEED_AIRTABLE_PAT or SEED_AIRTABLE_BASE_ID in env.');
  process.exit(1);
}

const BASE_URL = 'https://api.airtable.com/v0';

async function airtable<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable ${method} ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// schema

const ROLES = ['Engineer', 'Designer', 'PM', 'QA'] as const;
const STATUSES = ['Backlog', 'In Progress', 'In Review', 'Done', 'Blocked'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
const TAGS = ['frontend', 'backend', 'infra', 'bug', 'feature', 'chore'] as const;

const usersSchema = {
  name: 'Users',
  fields: [
    { name: 'Name', type: 'singleLineText' },
    { name: 'Email', type: 'email' },
    {
      name: 'Role',
      type: 'singleSelect',
      options: { choices: ROLES.map((name) => ({ name })) },
    },
    { name: 'ExternalId', type: 'singleLineText' },
  ],
};

const tasksSchema = (usersTableId: string) => ({
  name: 'Tasks',
  fields: [
    { name: 'Name', type: 'singleLineText' },
    {
      name: 'Status',
      type: 'singleSelect',
      options: { choices: STATUSES.map((name) => ({ name })) },
    },
    {
      name: 'Priority',
      type: 'singleSelect',
      options: { choices: PRIORITIES.map((name) => ({ name })) },
    },
    {
      name: 'Tags',
      type: 'multipleSelects',
      options: { choices: TAGS.map((name) => ({ name })) },
    },
    {
      name: 'Assignees',
      type: 'multipleRecordLinks',
      options: { linkedTableId: usersTableId },
    },
    { name: 'Due Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
    { name: 'Description', type: 'multilineText' },
    { name: 'Done', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    { name: 'Estimated Hours', type: 'number', options: { precision: 1 } },
    { name: 'Cost', type: 'currency', options: { precision: 2, symbol: '$' } },
    { name: 'Progress', type: 'percent', options: { precision: 0 } },
    { name: 'ExternalId', type: 'singleLineText' },
  ],
});

// generators

const FIRST_NAMES = [
  'Alex',
  'Sam',
  'Jordan',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Jamie',
  'Cameron',
  'Avery',
];
const LAST_NAMES = [
  'Chen',
  'Patel',
  'Kim',
  'Singh',
  'Garcia',
  'Nguyen',
  'Smith',
  'Rossi',
  'Diallo',
  'Park',
];
const VERBS = [
  'Refactor',
  'Investigate',
  'Ship',
  'Audit',
  'Migrate',
  'Document',
  'Optimize',
  'Triage',
];
const NOUNS = [
  'payment flow',
  'auth module',
  'CI pipeline',
  'metrics dashboard',
  'rate limiter',
  'cache layer',
  'webhook handler',
  'feature flag system',
];

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const externalIdFor = (table: string, name: string, i: number) =>
  createHash('sha256').update(`${table}|${name}|${i}`).digest('hex').slice(0, 16);

const pick = <T>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)]!;

function generateUsers(rng: () => number) {
  return Array.from({ length: USERS }, (_, i) => {
    const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)} ${i}`;
    const id = externalIdFor('Users', name, i);
    return {
      externalId: id,
      fields: {
        Name: name,
        Email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        Role: pick(rng, ROLES),
        ExternalId: id,
      },
    };
  });
}

function generateTasks(rng: () => number, userExternalIds: string[]) {
  return Array.from({ length: TASKS }, (_, i) => {
    const name = `${pick(rng, VERBS)} ${pick(rng, NOUNS)} #${i}`;
    const status = pick(rng, STATUSES);
    const tagCount = 1 + Math.floor(rng() * 3);
    const tags = Array.from(new Set(Array.from({ length: tagCount }, () => pick(rng, TAGS))));
    const assignees = [pick(rng, userExternalIds)];
    const due = new Date(Date.now() + Math.floor((rng() * 90 - 30) * 86400 * 1000));
    const estHours = 1 + Math.floor(rng() * 39);
    const id = externalIdFor('Tasks', name, i);
    return {
      externalId: id,
      assigneeExternalIds: assignees,
      fields: {
        Name: name,
        Status: status,
        Priority: pick(rng, PRIORITIES),
        Tags: tags,
        'Due Date': due.toISOString().slice(0, 10),
        Description: `${pick(rng, VERBS)} the ${pick(rng, NOUNS)}; follow up with the team.`,
        Done: status === 'Done',
        'Estimated Hours': estHours,
        Cost: estHours * 75,
        Progress:
          status === 'Done'
            ? 1
            : status === 'In Review'
              ? 0.5
              : status === 'In Progress'
                ? 0.25
                : 0,
        ExternalId: id,
      },
    };
  });
}

// main flow

interface Table {
  id: string;
  name: string;
}
interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function ensureTable(name: string, payload: unknown): Promise<Table> {
  const { tables } = await airtable<{ tables: Table[] }>('GET', `/meta/bases/${BASE_ID}/tables`);
  const existing = tables.find((t) => t.name === name);
  if (existing) {
    console.log(`[seed] ${name} table already exists.`);
    return existing;
  }
  console.log(`[seed] Creating ${name} table…`);
  return airtable<Table>('POST', `/meta/bases/${BASE_ID}/tables`, payload);
}

async function existingExternalIds(tableId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: '100' });
    if (offset) qs.set('offset', offset);
    const page = await airtable<{ records: AirtableRecord[]; offset?: string }>(
      'GET',
      `/${BASE_ID}/${tableId}?${qs}`,
    );
    for (const r of page.records) {
      const ext = r.fields['ExternalId'];
      if (typeof ext === 'string' && ext) out.set(ext, r.id);
    }
    offset = page.offset;
  } while (offset);
  return out;
}

async function insertChunked<T extends { externalId: string; fields: object }>(
  tableId: string,
  rows: T[],
  label: string,
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const { records } = await airtable<{ records: AirtableRecord[] }>(
      'POST',
      `/${BASE_ID}/${tableId}`,
      {
        records: batch.map((r) => ({ fields: r.fields })),
        typecast: true,
      },
    );
    batch.forEach((r, j) => {
      const rec = records[j];
      if (rec) idMap.set(r.externalId, rec.id);
    });
    if ((i + batch.length) % 50 === 0 || i + batch.length === rows.length) {
      console.log(`[seed]   inserted ${i + batch.length}/${rows.length} ${label}`);
    }
  }
  return idMap;
}

console.log(`[seed] Connecting to base ${BASE_ID}…`);

const usersTable = await ensureTable('Users', usersSchema);
const tasksTable = await ensureTable('Tasks', tasksSchema(usersTable.id));

const rng = mulberry32(SEED);
const allUsers = generateUsers(rng);
const allTasks = generateTasks(
  mulberry32(SEED + 1),
  allUsers.map((u) => u.externalId),
);

const existingUsers = await existingExternalIds(usersTable.id);
const newUsers = allUsers.filter((u) => !existingUsers.has(u.externalId));
console.log(`[seed] Users: ${existingUsers.size} existing, ${newUsers.length} new.`);
const userIdMap = new Map(existingUsers);
for (const [k, v] of await insertChunked(usersTable.id, newUsers, 'users')) userIdMap.set(k, v);

const resolvedTasks = allTasks.map((t) => ({
  externalId: t.externalId,
  fields: {
    ...t.fields,
    Assignees: t.assigneeExternalIds
      .map((eid) => userIdMap.get(eid))
      .filter((x): x is string => !!x),
  },
}));

const existingTasks = await existingExternalIds(tasksTable.id);
const newTasks = resolvedTasks.filter((t) => !existingTasks.has(t.externalId));
console.log(`[seed] Tasks: ${existingTasks.size} existing, ${newTasks.length} new.`);
const taskIdMap = new Map(existingTasks);
for (const [k, v] of await insertChunked(tasksTable.id, newTasks, 'tasks')) taskIdMap.set(k, v);

if (MUTATIONS > 0 && taskIdMap.size > 0) {
  console.log(`[seed] Mutating ${MUTATIONS} tasks for revision history…`);
  const taskIds = Array.from(taskIdMap.values());
  const userIds = Array.from(userIdMap.values());
  const mrng = mulberry32(SEED + 2);
  for (let i = 0; i < MUTATIONS; i++) {
    const tid = pick(mrng, taskIds);
    await airtable('PATCH', `/${BASE_ID}/${tasksTable.id}/${tid}`, {
      fields: {
        Status: pick(mrng, STATUSES),
        Assignees: [pick(mrng, userIds)],
      },
      typecast: true,
    });
  }
}

console.log('[seed] Done.');
