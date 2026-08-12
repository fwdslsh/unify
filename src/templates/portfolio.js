/**
 * `unify init portfolio` — a small portfolio site: a "Work" listing page
 * plus two individual project pages under `projects/`, hand-authored (unlike
 * `blog`, a portfolio's project list doesn't need a generator).
 */
import { contactHtml, layoutHtml, navHtml, notFoundHtml, styleCss } from "./shared.js";

const SITE_NAME = "My Portfolio";

export const files = {
  "_layout.html": layoutHtml(SITE_NAME),

  "_includes/nav.html": navHtml([
    ["Home", "/"],
    ["Work", "/work.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": `<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>Take a look at my <a href="/work.html">work</a>.</p>
    </main>
  </body>
</html>
`,

  "work.html": `<!doctype html>
<html>
  <head>
    <title>Work</title>
  </head>
  <body>
    <main>
      <h1>Work</h1>
      <ul>
        <li><a href="/projects/project-one.html">Project One</a></li>
        <li><a href="/projects/project-two.html">Project Two</a></li>
      </ul>
    </main>
  </body>
</html>
`,

  "projects/project-one.html": `<!doctype html>
<html>
  <head>
    <title>Project One</title>
  </head>
  <body>
    <main>
      <h1>Project One</h1>
      <p>Describe the project: the problem, your role, and the outcome.</p>
    </main>
  </body>
</html>
`,

  "projects/project-two.html": `<!doctype html>
<html>
  <head>
    <title>Project Two</title>
  </head>
  <body>
    <main>
      <h1>Project Two</h1>
      <p>Describe the project: the problem, your role, and the outcome.</p>
    </main>
  </body>
</html>
`,

  "contact.html": contactHtml(SITE_NAME),

  "404.html": notFoundHtml(),

  "assets/style.css": styleCss(),
};
