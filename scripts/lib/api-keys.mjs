export function apiKeys(names, source = process.env) {
  return [...new Set(
    names.flatMap((name) => String(source[name] || "").split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}
