type ShareNavigator = Pick<Navigator, 'share' | 'canShare'>;

export async function copyPreparedImage(blob: Blob, clipboard: Pick<Clipboard, 'write'> | undefined, Item: typeof ClipboardItem | undefined): Promise<'copied' | 'unsupported'> {
  if (!clipboard?.write || !Item) return 'unsupported';
  await clipboard.write([new Item({ 'image/png': blob })]);
  return 'copied';
}

/** Caller prepares the PNG before enabling the button. No await before native share. */
export async function sharePreparedImage(blob: Blob, filename: string, nav: Partial<ShareNavigator> = navigator): Promise<'opened' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!nav.share || !nav.canShare || !nav.canShare({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file] });
    // A resolved OS handoff does not prove the recipient received a file.
    return 'opened';
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
