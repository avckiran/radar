export function looksLikeUrl(text) {
  const value = (text ?? '').trim();
  if (!value || /\s/.test(value)) return false;
  if (/^https?:\/\/\S+\.\S+/i.test(value)) return true;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(value);
}

export function domainOf(text) {
  const value = (text ?? '').trim();
  if (!looksLikeUrl(value)) return '';
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
