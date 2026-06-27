/**
 * The asset shape the UI consumes (Assets library + editor insert panel). A subset
 * of the `assets` DB row, with timestamps serialized to ISO strings so it can cross
 * the server→client boundary as plain JSON.
 */
export interface Asset {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  bytes: number | null;
  createdAt: string;
}
