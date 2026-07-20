// In-text citation builder, mirroring backend citations.intext_citation so the
// citation the coach inserts into a draft matches the one PaperCard copies.

export function inTextCitation(paper, style) {
  const authors = Array.isArray(paper.authors) ? paper.authors : []
  const year = paper.year ? String(paper.year) : 'n.d.'
  const lasts = authors.length > 0
    ? authors.map(a => String(a).trim().split(' ').pop())
    : ['Unknown']

  if (style === 'mla') {
    if (lasts.length > 2) return `(${lasts[0]} et al. p. ##)`
    if (lasts.length === 2) return `(${lasts[0]} and ${lasts[1]} p. ##)`
    return `(${lasts[0]} p. ##)`
  }
  if (style === 'chicago') {
    if (lasts.length > 3) return `(${lasts[0]} et al. ${year})`
    return `(${lasts.join(', ')} ${year})`
  }
  if (style === 'ieee') {
    return '[#]' // numbered by position in the reference list
  }
  // apa / harvard
  if (lasts.length === 1) return `(${lasts[0]}, ${year})`
  if (lasts.length === 2) return `(${lasts[0]} & ${lasts[1]}, ${year})`
  return `(${lasts[0]} et al., ${year})`
}

// Same, but for a direct quote with a page number.
export function inTextCitationWithPage(paper, style, page) {
  if (page == null) return inTextCitation(paper, style)
  const base = inTextCitation(paper, style)
  if (style === 'mla') return base.replace('p. ##', String(page))
  if (style === 'chicago') return base.replace(/\)$/, `, ${page})`)
  if (style === 'ieee') return `[#, p. ${page}]`
  return base.replace(/\)$/, `, p. ${page})`) // apa / harvard
}
