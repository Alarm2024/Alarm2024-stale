/* page-menu.js — the "⋯ Ask AI" menu at the top of a content page.
 *
 * Five items, nothing else: Copy page, View as Markdown, Open in ChatGPT,
 * Open in Claude, Open in Cursor. Plain JS. No tracking, no cookies, no
 * network calls: the Markdown is built from the page in this tab, so it is
 * always the page as it is now.
 *
 * Use: put <div class="page-menu" data-page-menu></div> where the button
 * goes (its height is reserved inline, so nothing moves when it fills in),
 * and load this file with <script src="/page-menu.js" defer></script>.
 * One copy of this file is shared by every elghaly site; edit them together.
 */
(function () {
  "use strict";

  var slots = document.querySelectorAll("[data-page-menu]");
  if (!slots.length) return;

  var CSS =
    ".pm{position:relative;display:inline-block;font-size:.8125rem;line-height:1.2}" +
    ".pm>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;" +
    "min-height:32px;padding:0 .8rem;border:1px solid currentColor;border-radius:999px;" +
    "-webkit-user-select:none;user-select:none;white-space:nowrap}" +
    ".pm>summary::-webkit-details-marker{display:none}" +
    ".pm>summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    ".pm-dots{font-size:1.1em;letter-spacing:.05em}" +
    ".pm-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:60;width:16rem;" +
    "max-width:calc(100vw - 32px);padding:.35rem;border:1px solid rgba(127,127,127,.45);" +
    "border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.35);text-align:start}" +
    ".pm-rtl .pm-panel{right:auto;left:0}" +
    ".pm-panel a,.pm-panel button{display:flex;flex-direction:column;justify-content:center;" +
    "gap:.15rem;width:100%;min-height:44px;margin:0;padding:.5rem .7rem;border:0;" +
    "border-radius:8px;background:none;color:inherit;font:inherit;text-align:start;" +
    "text-decoration:none;cursor:pointer}" +
    ".pm-panel a:hover,.pm-panel button:hover,.pm-panel a:focus-visible,.pm-panel button:focus-visible" +
    "{background:rgba(127,127,127,.18);outline:none}" +
    ".pm-panel .pm-sub{font-size:.75rem;opacity:.75}" +
    ".pm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}";

  function addStyle() {
    if (document.getElementById("pm-style")) return;
    var s = document.createElement("style");
    s.id = "pm-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── the page's own address ──────────────────────────────────────────────
  function pageUrl() {
    var link = document.querySelector('link[rel="canonical"]');
    var href = link && link.getAttribute("href");
    if (href) {
      try {
        return new URL(href, location.href).href;
      } catch (e) { /* fall through */ }
    }
    return location.origin + location.pathname;
  }

  function prompt() {
    return "Read " + pageUrl() + " and help me with it";
  }

  // ── HTML → Markdown ─────────────────────────────────────────────────────
  var SKIP = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, CANVAS: 1, IFRAME: 1,
    BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, FORM: 1, NAV: 1, DIALOG: 1,
    VIDEO: 1, AUDIO: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1
  };
  var INLINE = {
    A: 1, ABBR: 1, B: 1, BDI: 1, BDO: 1, CITE: 1, CODE: 1, DATA: 1, DFN: 1, EM: 1,
    I: 1, KBD: 1, LABEL: 1, MARK: 1, Q: 1, S: 1, SAMP: 1, SMALL: 1, SPAN: 1,
    STRONG: 1, SUB: 1, SUP: 1, TIME: 1, U: 1, VAR: 1, WBR: 1, BR: 1, IMG: 1, DEL: 1, INS: 1
  };

  function hidden(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    if (el.hasAttribute("data-page-menu") || el.hasAttribute("data-md-skip")) return true;
    if (el.classList && (el.classList.contains("skip-link") || el.classList.contains("lic-badges"))) {
      return true;
    }
    var cs = window.getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  }

  // True when el is on screen and not inside anything the conversion skips:
  // hidden() looks at one element, this looks at the whole way up.
  function shown(el) {
    if (!el.getClientRects().length) return false;
    for (var e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (SKIP[e.tagName] || hidden(e)) return false;
    }
    return true;
  }

  function abs(url) {
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return url;
    }
  }

  function squash(s) {
    return s.replace(/[ \t\r\n\f]+/g, " ");
  }

  function inline(node) {
    if (node.nodeType === 3) return squash(node.nodeValue);
    if (node.nodeType !== 1) return "";
    var el = node, tag = el.tagName;
    if (SKIP[tag] || hidden(el)) return "";
    if (tag === "BR") return "\n";
    if (tag === "IMG") {
      var alt = (el.getAttribute("alt") || "").trim();
      return alt ? "![" + alt + "](" + abs(el.getAttribute("src") || "") + ")" : "";
    }
    var text = "";
    for (var c = el.firstChild; c; c = c.nextSibling) text += inline(c);
    var t = text.trim();
    if (!t) return text.indexOf("\n") >= 0 ? "\n" : (text ? " " : "");
    var lead = /^\s/.test(text) ? " " : "", tail = /\s$/.test(text) ? " " : "";
    switch (tag) {
      case "A": {
        var href = el.getAttribute("href") || "";
        if (!href || /^\s*javascript:/i.test(href) || href.charAt(0) === "#") return text;
        var url = abs(href);
        return lead + (url === t ? "<" + url + ">" : "[" + t + "](" + url + ")") + tail;
      }
      case "STRONG": case "B": return lead + "**" + t + "**" + tail;
      case "EM": case "I": return lead + "*" + t + "*" + tail;
      case "CODE": case "KBD": case "SAMP": return lead + "`" + t + "`" + tail;
      case "DEL": case "S": return lead + "~~" + t + "~~" + tail;
      default: return text;
    }
  }

  function inlineOf(el) {
    var s = "";
    for (var c = el.firstChild; c; c = c.nextSibling) s += inline(c);
    return s.replace(/ *\n */g, "\n").replace(/ {2,}/g, " ").trim();
  }

  function list(el, depth) {
    var ordered = el.tagName === "OL", n = 1, lines = [];
    var pad = new Array(depth + 1).join("   ");
    for (var li = el.firstElementChild; li; li = li.nextElementSibling) {
      if (li.tagName !== "LI" || hidden(li)) continue;
      var text = "", nested = [];
      for (var c = li.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) {
          if (!hidden(c)) nested.push(list(c, depth + 1));
        } else if (c.nodeType === 1 && !INLINE[c.tagName]) {
          if (!SKIP[c.tagName] && !hidden(c)) text += " " + inlineOf(c) + " ";
        } else {
          text += inline(c);
        }
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text && !nested.length) continue;
      lines.push(pad + (ordered ? n++ + ". " : "- ") + text);
      for (var k = 0; k < nested.length; k++) lines.push(nested[k]);
    }
    return lines.join("\n");
  }

  function table(el) {
    var rows = [], width = 0;
    var trs = el.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      if (hidden(trs[i])) continue;
      var cells = [];
      for (var c = trs[i].firstElementChild; c; c = c.nextElementSibling) {
        if (c.tagName === "TD" || c.tagName === "TH") {
          cells.push(inlineOf(c).replace(/\n/g, " ").replace(/\|/g, "\\|"));
        }
      }
      if (cells.length) {
        rows.push(cells);
        width = Math.max(width, cells.length);
      }
    }
    if (!rows.length) return "";
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      while (rows[r].length < width) rows[r].push("");
      out.push("| " + rows[r].join(" | ") + " |");
      if (r === 0) out.push("|" + new Array(width + 1).join(" --- |"));
    }
    return out.join("\n");
  }

  function blocks(root, out) {
    var para = "";
    function flush() {
      var p = para.replace(/ *\n */g, "\n").replace(/ {2,}/g, " ").trim();
      if (p) out.push(p);
      para = "";
    }
    for (var node = root.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3) {
        para += squash(node.nodeValue);
        continue;
      }
      if (node.nodeType !== 1) continue;
      var el = node, tag = el.tagName;
      if (SKIP[tag] || hidden(el)) continue;
      if (INLINE[tag]) {
        para += inline(el);
        continue;
      }
      flush();
      var m = /^H([1-6])$/.exec(tag);
      if (m) {
        var h = inlineOf(el).replace(/\n/g, " ");
        if (h) out.push(new Array(+m[1] + 1).join("#") + " " + h);
      } else if (tag === "P") {
        var p = inlineOf(el);
        if (p) out.push(p);
      } else if (tag === "UL" || tag === "OL") {
        var l = list(el, 0);
        if (l) out.push(l);
      } else if (tag === "PRE") {
        var code = (el.textContent || "").replace(/\n+$/, "");
        if (code.trim()) out.push("```\n" + code + "\n```");
      } else if (tag === "BLOCKQUOTE") {
        var inner = [];
        blocks(el, inner);
        if (inner.length) out.push(inner.join("\n\n").replace(/^/gm, "> "));
      } else if (tag === "TABLE") {
        var t = table(el);
        if (t) out.push(t);
      } else if (tag === "HR") {
        out.push("---");
      } else if (tag === "DT") {
        var dt = inlineOf(el);
        if (dt) out.push("**" + dt + "**");
      } else if (tag === "SUMMARY") {
        var s = inlineOf(el);
        if (s) out.push("**" + s + "**");
      } else if (tag === "FIGCAPTION") {
        var f = inlineOf(el);
        if (f) out.push("*" + f + "*");
      } else {
        blocks(el, out);
      }
    }
    flush();
  }

  function contentRoot() {
    var marked = document.querySelector("[data-md-root]");
    if (marked) return marked;
    var mains = document.querySelectorAll("main");
    if (mains.length === 1) return mains[0];
    // An <article> is only the page when it is the only one: on a page of
    // cards, the first card is not the page.
    var articles = document.querySelectorAll("article");
    if (!mains.length && articles.length === 1) return articles[0];
    return document.body;
  }

  function text(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  // An <h1> that is all link or all image is a site logo, not a page title.
  function isLogo(h) {
    var t = text(h), links = h.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) if (text(links[i]) === t) return true;
    return !t && !!h.querySelector("img, svg");
  }

  // The page title when the content root has no <h1> of its own: the first
  // visible <h1> that is not a logo (on these sites a hero <h1> sits in a
  // page-level <header> above <main>), else the document title.
  function pageTitle() {
    var hs = document.querySelectorAll("h1");
    for (var i = 0; i < hs.length; i++) {
      if (!shown(hs[i]) || isLogo(hs[i])) continue;
      var t = inlineOf(hs[i]).replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    return (document.title || "").trim();
  }

  function toMarkdown() {
    var root = contentRoot(), out = [];
    if (root === document.body) {
      // No <main>: leave the site chrome out. A <header> or <footer> is site
      // chrome only at page level, as in HTML's own landmark rule: inside an
      // <article> or <section> it carries that block's title or date. The
      // page title is not lost with a page-level header: pageTitle() finds
      // it. Decide every element first, then mark, so one mark cannot
      // change the next decision.
      var found = root.querySelectorAll("footer, nav, header, [role=banner], [role=navigation], [role=contentinfo]");
      var chrome = [];
      for (var i = 0; i < found.length; i++) {
        var el = found[i], tag = el.tagName;
        if (tag === "HEADER" || tag === "FOOTER") {
          var up = el.parentElement;
          if (up && up.closest("article, aside, main, nav, section")) continue;
        }
        chrome.push(el);
      }
      for (var k = 0; k < chrome.length; k++) chrome[k].setAttribute("data-md-skip", "");
      blocks(root, out);
      for (var j = 0; j < chrome.length; j++) chrome[j].removeAttribute("data-md-skip");
    } else {
      blocks(root, out);
    }
    var md = out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    var hasTitle = out.some(function (b) { return /^# /.test(b); });
    if (!hasTitle) {
      var title = pageTitle();
      if (title) md = "# " + title + "\n\n" + md;
    }
    return md + "\n\n---\nSource: " + pageUrl() + "\n";
  }

  // ── actions ─────────────────────────────────────────────────────────────
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* older engines */ }
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Opens a plain-text view of the Markdown in a new tab. A tab written from
  // here works the same in iPhone Safari as on a desktop; a blob: link in a
  // new tab does not always.
  function viewMarkdown(text) {
    var w = window.open("", "_blank");
    if (!w) return false;
    var d = w.document;
    d.open();
    d.write(
      '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex"><title>' +
      escapeHtml((document.title || "page") + ".md") + "</title></head>" +
      '<body style="margin:0;background:#fff;color:#111">' +
      '<pre style="margin:0;padding:16px;white-space:pre-wrap;word-wrap:break-word;' +
      'font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' +
      escapeHtml(text) + "</pre></body></html>"
    );
    d.close();
    return true;
  }

  function panelBackground(from) {
    for (var el = from; el && el.nodeType === 1; el = el.parentElement) {
      var bg = window.getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) return bg;
    }
    var root = window.getComputedStyle(document.documentElement).backgroundColor;
    return root && root !== "rgba(0, 0, 0, 0)" ? root : "#111";
  }

  // ── render ──────────────────────────────────────────────────────────────
  var ITEMS = [
    { act: "copy", label: "Copy page", sub: "Markdown for AI tools" },
    { act: "md", label: "View as Markdown", sub: "Plain text" },
    { href: function (q) { return "https://chatgpt.com/?q=" + q; }, label: "Open in ChatGPT" },
    { href: function (q) { return "https://claude.ai/new?q=" + q; }, label: "Open in Claude" },
    { href: function (q) { return "https://cursor.com/link/prompt?text=" + q; }, label: "Open in Cursor" }
  ];

  function build(slot) {
    var details = document.createElement("details");
    details.className = "pm";
    var summary = document.createElement("summary");
    summary.innerHTML = '<span class="pm-dots" aria-hidden="true">⋯</span><span>Ask AI</span>';
    var panel = document.createElement("div");
    panel.className = "pm-panel";
    var live = document.createElement("span");
    live.className = "pm-sr";
    live.setAttribute("aria-live", "polite");
    var q = encodeURIComponent(prompt());

    ITEMS.forEach(function (it) {
      var el;
      if (it.act) {
        el = document.createElement("button");
        el.type = "button";
        el.setAttribute("data-pm", it.act);
      } else {
        el = document.createElement("a");
        el.href = it.href(q);
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }
      var main = document.createElement("span");
      main.textContent = it.label + (it.href ? " ↗" : "");
      el.appendChild(main);
      if (it.sub) {
        var sub = document.createElement("span");
        sub.className = "pm-sub";
        sub.textContent = it.sub;
        el.appendChild(sub);
      }
      panel.appendChild(el);
    });

    details.appendChild(summary);
    details.appendChild(panel);
    slot.appendChild(details);
    slot.appendChild(live);

    details.addEventListener("toggle", function () {
      if (!details.open) return;
      panel.style.background = panelBackground(slot);
      // Read the direction now: a language switch can flip dir after load.
      var rtl = window.getComputedStyle(slot).direction === "rtl";
      details.classList.toggle("pm-rtl", rtl);
    });

    panel.addEventListener("click", function (e) {
      var target = e.target.closest ? e.target.closest("a,button") : null;
      if (!target) return;
      var act = target.getAttribute("data-pm");
      if (act === "copy") {
        var first = target.firstChild;
        copyText(toMarkdown()).then(function (ok) {
          first.textContent = ok ? "Copied ✓" : "Copy failed";
          live.textContent = ok ? "Page copied as Markdown" : "Copy failed";
          setTimeout(function () {
            first.textContent = "Copy page";
            live.textContent = "";
            details.open = false;
          }, 1400);
        });
        return;
      }
      if (act === "md") {
        if (!viewMarkdown(toMarkdown())) {
          live.textContent = "The browser blocked the new tab";
        }
      }
      details.open = false;
    });

    document.addEventListener("click", function (e) {
      if (details.open && !details.contains(e.target)) details.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (details.open && (e.key === "Escape" || e.key === "Esc")) {
        details.open = false;
        summary.focus();
      }
    });
  }

  addStyle();
  for (var i = 0; i < slots.length; i++) build(slots[i]);

  // For tests and for anyone curious: the same Markdown the menu copies.
  window.pageMenuMarkdown = toMarkdown;
})();
