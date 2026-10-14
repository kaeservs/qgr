// Long videos never leave the team's computer: the file picked on one page is
// kept here, in this tab's memory, so the moments page can play and cut it
// without asking for it again. A reload forgets it, and the page asks for the
// file once more (it knows it again by size and length, lib/long-video.ts).
const files = new Map<string, File>();

export const keepLocalFile = (id: string, file: File) => void files.set(id, file);
export const localFile = (id: string): File | null => files.get(id) ?? null;
