// What paper is on this page?
//
// Injected into the active tab when the student opens the popup, rather than
// running as a content script on every page they visit. A "save this" button
// does not need to watch someone's browsing, and an extension that reads every
// page is one no university will let near a student laptop.
//
// The order below is the order of decreasing certainty. Publishers put a DOI in
// their metadata far more often than anyone expects, and a DOI is an identifier
// — everything after it is inference, and the last resort is a title, which the
// server will only accept on an exact match.

(() => {
  const meta = names => {
    for (const name of names) {
      const el =
        document.querySelector(`meta[name="${name}" i]`) ||
        document.querySelector(`meta[property="${name}" i]`)
      const value = el?.content?.trim()
      if (value) return value
    }
    return ''
  }

  const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+/i

  const cleanDoi = raw => {
    const m = (raw || '').match(DOI_RE)
    return m ? m[0].replace(/[.,;)\]"']+$/, '') : ''
  }

  // 1. Publisher metadata. Highwire (citation_*) is near-universal on journal
  //    sites; Dublin Core and PRISM cover most of the rest.
  let doi = cleanDoi(
    meta(['citation_doi', 'dc.identifier', 'dc.identifier.doi', 'prism.doi', 'doi']),
  )

  // 2. Structured data, which is where newer platforms put it.
  if (!doi) {
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = cleanDoi(JSON.stringify(JSON.parse(node.textContent)))
        if (found) { doi = found; break }
      } catch {}
    }
  }

  // 3. The URL itself. Resolver links and many publisher paths carry it.
  if (!doi) doi = cleanDoi(decodeURIComponent(location.href))

  // 4. arXiv has no DOI in its metadata, but every arXiv id has a registered
  //    DataCite DOI with a known shape.
  if (!doi) {
    const arxiv = location.href.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i)
    if (arxiv) doi = `10.48550/arXiv.${arxiv[1].replace(/v\d+$/, '')}`
  }

  // 5. Visible text, last. Scoped to the top of the document because a DOI
  //    found in the reference list belongs to a *different* paper — saving that
  //    one would be worse than saving nothing.
  if (!doi) {
    const head = (document.body?.innerText || '').slice(0, 3000)
    doi = cleanDoi(head)
  }

  const title =
    meta(['citation_title', 'dc.title', 'og:title']) ||
    document.querySelector('h1')?.innerText?.trim() ||
    document.title ||
    ''

  // A search results page is not a paper. Saying so is more useful than
  // resolving whichever result happened to be listed first.
  const isResultsPage =
    /scholar\.google\.[a-z.]+\/scholar\?/i.test(location.href) ||
    /pubmed\.ncbi\.nlm\.nih\.gov\/\?term=/i.test(location.href) ||
    /(^|\.)semanticscholar\.org\/search/i.test(location.href)

  return {
    doi,
    title: title.slice(0, 400),
    url: location.href,
    isResultsPage,
  }
})()
