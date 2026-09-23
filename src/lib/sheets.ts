/**
 * Minimal read-only Google Sheets API v4 client. Pure functions with the
 * network call injected, so they can be unit tested without Google.
 * Authentication (getting the access token) lives in googleAuth.ts.
 */

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SheetsError';
  }
}

export interface SheetMeta {
  id: string;
  title: string;
  tabs: string[];
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSheetUrl(input: string): string | null {
  const s = input.trim();
  // Also covers multi-account URLs: /spreadsheets/u/1/d/<id>
  const fromUrl = s.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

/** Pick the tab to load: the remembered one if it still exists, else one that looks like data, else the first. */
export function pickDefaultTab(tabs: string[], preferred?: string | null): string | null {
  if (preferred && tabs.includes(preferred)) return preferred;
  return tabs.find((t) => /fin|data|transaction/i.test(t)) ?? tabs[0] ?? null;
}

function explain(status: number, detail: string): string {
  switch (status) {
    case 401:
      return 'Your Google sign-in has expired. Click Refresh to sign in again.';
    case 403:
      return /has not been used|is disabled|not enabled/i.test(detail)
        ? 'The Google Sheets API isn’t enabled in your Google Cloud project. Enable it (see README → Google Sheets) and try again.'
        : 'The Google account you signed in with can’t open this sheet. Check you picked the right account.';
    case 404:
      return 'Sheet not found. Check the URL or ID.';
    case 429:
      return 'Google is rate-limiting requests. Wait a minute and try again.';
    default:
      return `Google Sheets error ${status}${detail ? `: ${detail}` : ''}`;
  }
}

async function getJson<T>(url: string, token: string, fetchFn: FetchLike): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new SheetsError('Couldn’t reach Google. Check your internet connection.');
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      /* body wasn't JSON */
    }
    throw new SheetsError(explain(res.status, detail), res.status);
  }
  return (await res.json()) as T;
}

/** Spreadsheet title and the names of its tabs. */
export async function getSheetMeta(id: string, token: string, fetchFn: FetchLike = defaultFetch): Promise<SheetMeta> {
  const body = await getJson<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    `${API}/${encodeURIComponent(id)}?fields=properties.title,sheets.properties.title`,
    token,
    fetchFn,
  );
  return {
    id,
    title: body.properties?.title ?? 'Untitled spreadsheet',
    tabs: (body.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean),
  };
}

/**
 * Every cell of one tab as displayed in Sheets ("-€1,307.63", "May 2025"),
 * so it parses exactly like a CSV export of the same tab. The API drops
 * trailing empty cells, so rows are padded back out to the header width.
 */
export async function getTabValues(id: string, tab: string, token: string, fetchFn: FetchLike = defaultFetch): Promise<string[][]> {
  const range = `'${tab.replace(/'/g, "''")}'`;
  const body = await getJson<{ values?: unknown[][] }>(
    `${API}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
    token,
    fetchFn,
  );
  const rows = (body.values ?? []).map((r) => r.map((c) => (c == null ? '' : String(c))));
  const header = rows.find((r) => r.some((c) => c.trim())) ?? [];
  return rows.map((r) => (r.length < header.length ? [...r, ...Array<string>(header.length - r.length).fill('')] : r));
}
