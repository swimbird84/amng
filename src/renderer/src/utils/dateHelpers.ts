export function getAge(birthday: string | null): string {
  if (!birthday) return '-'
  const diff = Date.now() - new Date(birthday).getTime()
  const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  return `${age}세`
}

export function getDebutAge(birthday: string | null, debutDate: string | null): string {
  if (!birthday || !debutDate) return '-'
  const diff = new Date(debutDate).getTime() - new Date(birthday).getTime()
  const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  return `${age}세`
}
