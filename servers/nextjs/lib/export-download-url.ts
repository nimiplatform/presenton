export function canonicalExportDownloadUrl(relativePath: string): string {
  // Export filenames are sanitized by their producer; Windows filesystem
  // separators must become URL separators before the query is encoded.
  const urlPath = relativePath.replaceAll('\\', '/');
  return `/api/export-presentation/file?name=${encodeURIComponent(urlPath)}`;
}
