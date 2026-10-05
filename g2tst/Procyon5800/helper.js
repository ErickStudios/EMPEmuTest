export async function loadFile(fnam) {
  const url = new URL(fnam, import.meta.url)
  const txt = await fetch(url).then(r => r.text())
  return txt;
}