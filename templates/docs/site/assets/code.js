// Code blocks: a copy button, then syntax colours. Progressive enhancement
// only — a page reads the same without it. Every fenced block (<pre><code>)
// in a page's content gets both; a hand-written <pre> without <code>, such as
// a .term-body transcript, is left as written.
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

const blocks = [...document.querySelectorAll("main pre")].filter((pre) => pre.querySelector(":scope > code"));

for (const pre of blocks) {
  const wrap = document.createElement("div");
  wrap.className = "code-wrap";
  pre.replaceWith(wrap);
  wrap.append(pre);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.innerHTML = `${COPY_ICON}<span>copy</span>`;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent.trim());
      button.dataset.copied = "";
      button.innerHTML = `${CHECK_ICON}<span>copied</span>`;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      button.innerHTML = `${COPY_ICON}<span>select</span>`;
    }
    setTimeout(() => {
      delete button.dataset.copied;
      button.innerHTML = `${COPY_ICON}<span>copy</span>`;
    }, 1200);
  });
  wrap.append(button);
}

// speed-highlight 1.2.14 (the npm package @speed-highlight/core), dedicated
// to the public domain under CC0-1.0, vendored as its two dist files. The
// imports resolve against this file, so they survive a --base-url with a path prefix.
if (blocks.length) {
  Promise.all([import("./vendor/speed-highlight/index.js"), import("./vendor/speed-highlight/detect.js")])
    .then(([{ highlightElement }, { detectLanguage }]) => {
      for (const pre of blocks) {
        const code = pre.querySelector(":scope > code");
        const declared = code.className.match(/language-([\w-]+)/);
        const lang = declared ? declared[1] : detectLanguage(code.textContent) || "plain";
        pre.textContent = code.textContent;
        // A language the highlighter does not know leaves the block plain.
        Promise.resolve()
          .then(() => highlightElement(pre, ["sh", "shell", "console"].includes(lang) ? "bash" : lang, "oneline"))
          .catch(() => {});
      }
    })
    .catch(() => {
      /* unhighlighted code is fine */
    });
}
