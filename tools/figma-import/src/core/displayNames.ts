export function humanizeDisplayName(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_:-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : 'Layer';
}

export function slotDisplayName(slotName: string, explicit?: string) {
  return explicit ?? humanizeDisplayName(slotName);
}
