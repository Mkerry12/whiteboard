import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import * as Y from "yjs";

export function documentPath(directory: string, documentName: string): string {
  const safe =
    documentName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "document";
  const root = path.resolve(directory);
  const file = path.resolve(root, `${safe}.yjs`);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!file.startsWith(rootPrefix)) {
    throw new Error("Invalid document name");
  }
  return file;
}

export async function loadDocument(
  directory: string,
  documentName: string,
  document: Y.Doc,
): Promise<void> {
  try {
    const bytes = await readFile(documentPath(directory, documentName));
    Y.applyUpdate(document, bytes);
  } catch (error) {
    if (isEnoent(error)) return;
    throw error;
  }
}

export async function storeDocument(
  directory: string,
  documentName: string,
  document: Y.Doc,
): Promise<void> {
  const file = documentPath(directory, documentName);
  await mkdir(directory, { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, Y.encodeStateAsUpdate(document));
  await rename(temporary, file);
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
