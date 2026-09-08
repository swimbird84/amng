export function getAge(birthday: string | null): string {
  if (!birthday) return '-'
  const b = new Date(birthday)
  const now = new Date()
  let years = now.getFullYear() - b.getFullYear()
  let months = now.getMonth() - b.getMonth()
  let days = now.getDate() - b.getDate()
  if (days < 0) {
    months--
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  return `${years}세 ${months}개월 ${days}일`
}

export function getDebutAge(birthday: string | null, debutDate: string | null): string {
  if (!birthday || !debutDate) return '-'
  const b = new Date(birthday)
  const d = new Date(debutDate)
  let years = d.getFullYear() - b.getFullYear()
  let months = d.getMonth() - b.getMonth()
  let days = d.getDate() - b.getDate()
  if (days < 0) {
    months--
    days += new Date(d.getFullYear(), d.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  return `${years}세 ${months}개월 ${days}일`
}
