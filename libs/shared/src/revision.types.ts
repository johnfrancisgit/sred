export interface RevisionEvent {
  uuid: string;
  issueId: string;
  baseId: string;
  columnType: string;
  oldValue: string | null;
  newValue: string | null;
  createdDate: string;
  authoredBy: string;
  runId: string;
  scrapedAt: string;
}

export interface RevisionEventResponse extends RevisionEvent {
  authoredByName?: string;
}
