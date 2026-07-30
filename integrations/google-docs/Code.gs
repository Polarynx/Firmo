/**
 * Firmo for Google Docs.
 *
 * Most students do not write their paper in Firmo. They write it in Docs,
 * because that is where the assignment template came from and where their group
 * partner is. A research tool that ends at its own text box hands the student a
 * copy-paste job at exactly the moment citations get mangled — which is where
 * most bad bibliographies actually come from.
 *
 * So this carries the project into the document that gets submitted: the saved
 * sources, an in-text citation at the cursor, and a works-cited page that is
 * generated from the publisher's record rather than typed out.
 *
 * Everything talks to the Firmo API from Apps Script's servers, not from the
 * browser, so there is no CORS story here and the token never touches the page.
 * The token lives in per-user properties, which are scoped to this add-on and
 * this Google account — not in the document, where a collaborator could read it.
 */

var DEFAULT_API = 'http://localhost:8000';

// ── Lifecycle ───────────────────────────────────────────────────────────────

function onOpen() {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Open Firmo', 'showSidebar')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function onHomepage() {
  showSidebar();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Firmo');
  DocumentApp.getUi().showSidebar(html);
}

// ── Settings and session ────────────────────────────────────────────────────

function props_() {
  return PropertiesService.getUserProperties();
}

function apiBase_() {
  return (props_().getProperty('apiBase') || DEFAULT_API).replace(/\/+$/, '');
}

function getSettings() {
  return {
    apiBase: apiBase_(),
    signedIn: !!props_().getProperty('token')
  };
}

function saveSettings(apiBase) {
  props_().setProperty('apiBase', String(apiBase || '').replace(/\/+$/, ''));
  // A token minted by one deployment is meaningless to another, and leaving it
  // in place makes the next call fail in a way that looks like a bug.
  props_().deleteProperty('token');
  return getSettings();
}

function signOut() {
  props_().deleteProperty('token');
  return getSettings();
}

/**
 * One HTTP call to Firmo.
 *
 * `muteHttpExceptions` is on so a 401 comes back as data rather than as a
 * thrown exception that the sidebar can only report as "something went wrong".
 */
function call_(path, method, payload, useAuth) {
  var options = {
    method: method || 'get',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {}
  };
  if (payload) options.payload = JSON.stringify(payload);
  if (useAuth !== false) {
    var token = props_().getProperty('token');
    if (token) options.headers.Authorization = 'Bearer ' + token;
  }

  var response = UrlFetchApp.fetch(apiBase_() + path, options);
  var code = response.getResponseCode();
  var body = {};
  try {
    body = JSON.parse(response.getContentText() || '{}');
  } catch (e) {
    body = {};
  }

  if (code === 401) {
    props_().deleteProperty('token');
    throw new Error('Your Firmo session expired. Sign in again.');
  }
  if (code < 200 || code >= 300) {
    throw new Error(body.detail || ('Firmo returned ' + code));
  }
  return body;
}

function signIn(email, password) {
  var data = call_('/api/auth/login', 'post', { email: email, password: password }, false);
  props_().setProperty('token', data.token);
  return getSettings();
}

// ── Reading the project ─────────────────────────────────────────────────────

function listProjects() {
  return call_('/api/projects', 'get').projects || [];
}

function project_(projectId) {
  var result = call_('/api/sync', 'post', { projects: [] });
  var projects = result.projects || [];
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].id === projectId) return projects[i];
  }
  throw new Error('That paper is no longer in your Firmo account.');
}

/**
 * The sources saved to one project, each with its in-text form and its full
 * bibliography entry.
 *
 * Both come from the server, which is the only place that knows the CSL rules.
 * An in-text citation hand-rolled here as "(Surname, Year)" is simply wrong in
 * two of the five styles Firmo offers — IEEE numbers its citations and MLA
 * carries a page locator — and a citation that is confidently wrong is worse
 * than one the student knows they have to check.
 */
function getSources(projectId, style) {
  var project = project_(projectId);
  var sources = (project.data && project.data.sources) || [];
  if (!sources.length) return { name: project.name, sources: [] };

  var formatted = call_('/api/export', 'post', {
    papers: sources,
    style: style,
    format: 'text'
  });
  var entries = formatted.entries || [];

  var out = [];
  for (var j = 0; j < sources.length; j++) {
    var paper = sources[j];
    var entry = entries[j] || {};
    out.push({
      title: paper.title || '',
      authors: paper.authors || [],
      year: paper.year || null,
      journal: paper.journal || null,
      // IEEE returns "[#]", numbered by position in the reference list. This
      // add-on writes that very list, in this order, so the number is known
      // here and filling it in is safe — unlike the workspace, which cannot
      // know where in a draft a citation will end up.
      inText: String(entry.intext || '').replace('[#]', '[' + (j + 1) + ']')
    });
  }
  return { name: project.name, sources: out };
}

// ── Writing into the document ───────────────────────────────────────────────

/**
 * Put a citation where the cursor is.
 *
 * Falls back to the end of the current selection, and then to the end of the
 * document, because a student who clicks Cite with no cursor should get their
 * citation somewhere findable rather than an error dialog.
 */
function insertCitation(text) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();
  if (cursor) {
    var inserted = cursor.insertText(text);
    if (inserted) {
      doc.setCursor(doc.newPosition(inserted, text.length));
      return 'cursor';
    }
  }

  var selection = doc.getSelection();
  if (selection) {
    var elements = selection.getRangeElements();
    var last = elements[elements.length - 1].getElement();
    if (last.editAsText) {
      last.asText().appendText(text);
      return 'selection';
    }
  }

  doc.getBody().appendParagraph(text);
  return 'end';
}

/**
 * Append the works-cited page: a page break, the right heading for the style,
 * and every source with a hanging indent.
 *
 * APA calls it References and MLA calls it Works Cited, and using the wrong one
 * costs real marks — so the heading comes from the style rather than from a
 * generic label.
 */
function insertWorksCited(projectId, style) {
  var project = project_(projectId);
  var sources = (project.data && project.data.sources) || [];
  if (!sources.length) throw new Error('This paper has no saved sources yet.');

  var formatted = call_('/api/export', 'post', {
    papers: sources,
    style: style,
    format: 'text'
  });

  var entries = (formatted.entries || []).map(function (entry) {
    return entry.citation || '';
  }).filter(function (text) {
    return text.trim().length > 0;
  });

  var body = DocumentApp.getActiveDocument().getBody();
  body.appendPageBreak();

  var heading = style === 'mla' ? 'Works Cited' : 'References';
  var headingParagraph = body.appendParagraph(heading);
  headingParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  headingParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  for (var j = 0; j < entries.length; j++) {
    var paragraph = body.appendParagraph('');
    writeRichEntry_(paragraph, entries[j]);
    paragraph.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    // A real hanging indent, not a line of spaces: the second line of every
    // entry indents, which is what both style guides actually require.
    paragraph.setIndentFirstLine(0);
    paragraph.setIndentStart(36);
    paragraph.setSpacingAfter(0);
    paragraph.setLineSpacing(2);
  }

  return entries.length;
}

/**
 * Write one bibliography entry, honouring the markup CrossRef puts in it.
 *
 * Formatted citations come back containing real HTML — `<i>` around journal and
 * book titles, and escaped entities like `&amp;`. Appending that string
 * directly prints "&lt;i&gt;Journal of Family Psychology&lt;/i&gt;" into the
 * student's bibliography, which is both wrong and obviously machine-made. Both
 * style guides require those titles in italic, so the tags are turned into
 * actual italic runs, the same way the .docx exporter does it.
 */
function writeRichEntry_(paragraph, html) {
  var text = paragraph.editAsText();
  var pattern = /<i>([\s\S]*?)<\/i>/gi;
  var cursor = 0;
  var match;

  while ((match = pattern.exec(html)) !== null) {
    appendRun_(text, html.slice(cursor, match.index), false);
    appendRun_(text, match[1], true);
    cursor = match.index + match[0].length;
  }
  appendRun_(text, html.slice(cursor), false);
}

function appendRun_(text, chunk, italic) {
  var plain = decodeEntities_(String(chunk).replace(/<[^>]+>/g, ''));
  if (!plain) return;
  var start = text.getText().length;
  text.appendText(plain);
  text.setItalic(start, start + plain.length - 1, !!italic);
}

function decodeEntities_(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
