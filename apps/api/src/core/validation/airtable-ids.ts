import { z } from 'zod';

// Airtable base IDs always start with `app` followed by alphanumerics.
export const AirtableBaseIdZ = z.string().regex(/^app[A-Za-z0-9]+$/, 'Invalid Airtable base ID');
