/**
 * Firmo for Google Docs.
 *
 * The counterpart to the Word add-in, and a different animal for one reason:
 * Apps Script runs on Google's servers, not in the browser, so `UrlFetchApp`
 * calls Firmo server-to-server. There is no CORS to configure, no origin to
 * allow, and no streaming — `UrlFetchApp` has no incremental reader, so the
 * NDJSON responses are consumed whole and parsed line by line at the end.
 *
 * That last point shapes the UI: Word can show claims arriving one at a time,
 * and this cannot. So the sidebar commits to saying clearly that it is working,
 * rather than pretending to stream.
 *
 * Deploy: clasp push, or paste into Extensions → Apps Script on a document,
 * then Deploy → Test deployments → Install.
 */

var API = 'https://firmo.app';

// Docs has an open colour space rather than Word's fixed highlight palette, so
// these are the workspace's own ramp, lightened to sit under 11pt black text.
var HIGHLIGHT = {
  needs_citation: '#ffe9b8',
  shaky: '#ffd4d1',
  backed: '#d3e9c6',
  cited: '#d3e9c6'
};

var HEADING_RE = /^\s*(works\s+cited|references|bibliography|reference\s+list)\s*:?\s*$/i;

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Firmo')
    .addItem('Check this draft', 'showSidebar')
    .addSeparator()
    .addItem('Clear Firmo highlights', 'clearHighlights')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Firmo');
  DocumentApp.getUi().showSidebar(html);
}

/** The whole document, as the student sees it. */
function getBodyText() {
  return DocumentApp.getActiveDocument().getBody().getText();
}

/**
 * The reference list, separated from the prose.
 *
 * Same reasoning as the Word side: a document has no structural marker for its
 * bibliography, so it is found the way a reader finds it — the last heading that
 * says so, and everything after. Falling back to the whole document is safe
 * because the checker ignores anything that does not parse as a reference.
 */
function getReferencesText() {
  var paras = DocumentApp.getActiveDocument().getBody().getParagraphs();
  var start = -1;
  for (var i = 0; i < paras.length; i++) {
    if (HEADING_RE.test(paras[i].getText())) start = i;
  }
  var out = [];
  for (var j = (start === -1 ? 0 : start + 1); j < paras.length; j++) {
    out.push(paras[j].getText());
  }
  return out.join('\n');
}

/** POST an NDJSON endpoint and return every parsed line. */
function postNdjson(path, payload) {
  var res = UrlFetchApp.fetch(API + path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 429) throw new Error('Firmo is rate limited right now. Give it a minute.');
  if (code !== 200) throw new Error('Firmo returned ' + code + '.');

  var events = [];
  var lines = res.getContentText().split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    try { events.push(JSON.parse(line)); } catch (err) { /* truncated tail */ }
  }
  return events;
}

/** Run the claim check and return the final claim list to the sidebar. */
function checkDraft(shouldHighlight) {
  var text = getBodyText();
  if (text.split(/\s+/).length < 40) {
    return { claims: [], short: true };
  }

  var events = postNdjson('/api/draft-check', { text: text, saved_papers: [] });
  var claims = [];
  var byId = {};

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.event === 'error') throw new Error(ev.message || 'Firmo could not read this draft.');
    if (ev.event === 'claims') {
      claims = ev.claims || [];
      for (var k = 0; k < claims.length; k++) byId[claims[k].id] = k;
    }
    if (ev.event === 'claim' && byId[ev.id] !== undefined) {
      var idx = byId[ev.id];
      for (var key in ev) if (key !== 'event') claims[idx][key] = ev[key];
    }
  }

  if (shouldHighlight) highlightClaims(claims);
  return { claims: claims, short: false };
}

/**
 * Paint the claims onto the document.
 *
 * `findText` takes a regular expression, so every character the student wrote
 * has to be escaped before it is searched for — an unescaped bracket or full
 * stop in a quoted sentence would either fail to match or, worse, match the
 * wrong span and highlight the neighbouring paragraph.
 */
function highlightClaims(claims) {
  var body = DocumentApp.getActiveDocument().getBody();
  for (var i = 0; i < claims.length; i++) {
    var colour = HIGHLIGHT[claims[i].status];
    if (!colour) continue;
    var quote = (claims[i].quote || '').trim();
    if (quote.length < 12) continue;

    var found = body.findText(escapeRe(quote.slice(0, 240)));
    while (found) {
      var el = found.getElement();
      var start = found.getStartOffset();
      var end = found.getEndOffsetInclusive();
      if (start >= 0 && end >= start) {
        el.asText().setBackgroundColor(start, end, colour);
      }
      found = body.findText(escapeRe(quote.slice(0, 240)), found);
    }
  }
}

function clearHighlights() {
  var text = DocumentApp.getActiveDocument().getBody().editAsText();
  text.setBackgroundColor(0, Math.max(0, text.getText().length - 1), null);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Verify the reference list. */
function checkCitations() {
  var text = getReferencesText();
  if (!text.trim()) return { items: [], empty: true };

  var events = postNdjson('/api/check-citations', { text: text });
  var items = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (ev.event === 'error') throw new Error(ev.message || 'Firmo could not read that list.');
    if (ev.event === 'entries') items = ev.items || [];
    if (ev.event === 'result' && items[ev.index]) {
      for (var key in ev) if (key !== 'event' && key !== 'index') items[ev.index][key] = ev[key];
    }
  }
  return { items: items, empty: false };
}

/**
 * Insert a citation into its sentence, and the source into the works-cited page.
 *
 * Both halves or neither: a citation pointing at a bibliography entry that does
 * not exist is worse than no citation, because it looks finished.
 */
function insertCitation(claim, paper, style) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  var surname = 'Author';
  if (paper.authors && paper.authors.length) {
    var parts = String(paper.authors[0]).trim().split(/\s+/);
    surname = parts[parts.length - 1];
  }
  var inline = paper.year ? '(' + surname + ', ' + paper.year + ')' : '(' + surname + ')';

  var quote = (claim.quote || '').trim().slice(0, 240);
  var found = quote.length >= 12 ? body.findText(escapeRe(quote)) : null;

  if (found) {
    var el = found.getElement().asText();
    var end = found.getEndOffsetInclusive();
    var ch = el.getText().charAt(end);
    // Before the closing full stop, the way a citation is actually written.
    var at = /[.!?]/.test(ch) ? end : end + 1;
    el.insertText(at, ' ' + inline);
    el.setBackgroundColor(found.getStartOffset(), at + inline.length, HIGHLIGHT.cited);
  } else {
    body.appendParagraph(inline);
  }

  var entry = formatEntry(paper, style);
  if (entry) appendToBibliography(body, entry);
  return inline;
}

function formatEntry(paper, style) {
  try {
    var res = UrlFetchApp.fetch(API + '/api/export', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ papers: [paper], style: style || 'apa', format: 'text' }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return '';
    return (JSON.parse(res.getContentText()).content || '').trim();
  } catch (e) {
    return '';
  }
}

function appendToBibliography(body, entry) {
  var paras = body.getParagraphs();
  var head = -1;
  for (var i = 0; i < paras.length; i++) {
    if (HEADING_RE.test(paras[i].getText())) head = i;
  }

  if (head === -1) {
    body.appendParagraph('References').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(entry).setHeading(DocumentApp.ParagraphHeading.NORMAL);
    return;
  }

  // A duplicate reference is worse than a missing one: nobody spots it before
  // printing, and it reads as carelessness rather than as a tool's mistake.
  var key = entry.slice(0, 60).toLowerCase();
  for (var j = head + 1; j < paras.length; j++) {
    if (paras[j].getText().toLowerCase().indexOf(key) !== -1) return;
  }
  body.appendParagraph(entry).setHeading(DocumentApp.ParagraphHeading.NORMAL);
}
