(function () {
  "use strict";

  var picker = document.getElementById("family-picker");
  var results = document.getElementById("catalogue-results");
  if (!picker || !results) return;

  // The family links are real <a href> attributes, so unify has already
  // rewritten them (pretty-urls, --base-url) into full, correct addresses.
  // We derive the site root from one of those instead of assuming a path
  // depth, so this keeps working no matter where the site is hosted.
  function siteRootFrom(dataHref) {
    return dataHref.replace(/catalogue\/data\/[^/]+$/, "");
  }

  function pluralPackets(n) {
    return n === 1 ? "1 packet" : n + " packets";
  }

  function renderResults(familyName, items, siteRoot) {
    results.innerHTML = "";

    var heading = document.createElement("h2");
    heading.textContent = familyName + " — " + items.length +
      (items.length === 1 ? " variety" : " varieties");
    results.appendChild(heading);

    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "catalogue-hint";
      empty.textContent = "Nothing listed for " + familyName + " this season.";
      results.appendChild(empty);
      return;
    }

    var list = document.createElement("ul");
    list.className = "variety-list";

    items.forEach(function (v) {
      var li = document.createElement("li");

      var a = document.createElement("a");
      a.href = siteRoot + "varieties/" + v.slug + "/";
      a.textContent = v.name;
      li.appendChild(a);

      var meta = document.createElement("span");
      meta.className = "variety-meta";
      meta.textContent = " — " + v.season + ", ready in about " +
        v.days_to_maturity + " days, " + pluralPackets(v.packets_available) +
        " available";
      li.appendChild(meta);

      list.appendChild(li);
    });

    results.appendChild(list);
  }

  picker.addEventListener("click", function (event) {
    var link = event.target.closest ? event.target.closest("a[data-family]") : null;
    if (!link) return;
    event.preventDefault();

    var familyName = link.getAttribute("data-family");
    var dataHref = link.href; // fully resolved by the browser
    var siteRoot = siteRootFrom(dataHref);

    var links = picker.querySelectorAll("a[data-family]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("aria-current", links[i] === link ? "true" : "false");
    }

    results.innerHTML = '<p class="catalogue-hint">Loading ' + familyName + '…</p>';

    fetch(dataHref)
      .then(function (res) {
        if (!res.ok) throw new Error("request failed: " + res.status);
        return res.json();
      })
      .then(function (items) {
        renderResults(familyName, items, siteRoot);
      })
      .catch(function () {
        results.innerHTML = '<p class="catalogue-hint">Could not load ' +
          familyName + " right now. <a href=\"" + dataHref +
          '">Open the raw list</a> instead.</p>';
      });
  });
})();
