// CrossRef renders citations through the official CSL styles and hands them
// back with real markup in them — italic journal titles, `&amp;` for the
// ampersand APA wants. Printing that string straight into JSX shows a student
// "<i>Zenodo</i>" on their works-cited page, so we parse it instead.
//
// Parsing happens through DOMParser into a detached document and the result is
// rebuilt as React elements: nothing is ever handed to dangerouslySetInnerHTML,
// unknown tags are unwrapped to their text, and scripts cannot run.

const ALLOWED = {
  I: 'i',
  EM: 'em',
  B: 'b',
  STRONG: 'strong',
  SUP: 'sup',
  SUB: 'sub',
}

function toNodes(node, key) {
  if (node.nodeType === 3) return node.nodeValue // text
  if (node.nodeType !== 1) return null           // comments, etc.

  const children = Array.from(node.childNodes).map((c, i) => toNodes(c, i))
  const Tag = ALLOWED[node.tagName]
  // An unknown tag contributes its contents but not itself.
  return Tag
    ? <Tag key={key}>{children}</Tag>
    : <span key={key}>{children}</span>
}

/** A citation string as React nodes, with its markup honoured. */
export function renderMarkup(str) {
  if (!str) return null
  if (!/[<&]/.test(str)) return str // plain text, the common case
  const doc = new DOMParser().parseFromString(str, 'text/html')
  return Array.from(doc.body.childNodes).map((n, i) => toNodes(n, i))
}

/** The same string as plain text, for the clipboard and downloaded files. */
export function stripMarkup(str) {
  if (!str) return ''
  if (!/[<&]/.test(str)) return str
  const doc = new DOMParser().parseFromString(str, 'text/html')
  return doc.body.textContent || ''
}
