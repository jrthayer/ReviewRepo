# Fragile / jank solutions

This is a checklist of deliberate but fragile workarounds in this codebase —
things that work by relying on an assumption that could silently stop being
true. If something is behaving strangely (a link goes to the wrong place, a
page doesn't load, an import silently fails) and the cause isn't obvious,
check here first before assuming it's a new bug.

## GitHub Pages review-permalink redirect trick (`404.html`, `index.html`)

**What it does:** `/review/<id>` is a real, clean URL, but GitHub Pages
serves purely static files with no server-side rewrites — there's no actual
file at that path. `404.html` (which GitHub Pages serves for any unmatched
path) redirects back to `index.html`, carrying the original path in a `?p=`
query param; `index.html`'s own bootstrap script (top of `<head>`) restores
the clean URL via `history.replaceState` before anything else runs, and
computes `window.SITE_ROOT` (this deployment's base path) at the same time.
Every other script relies on `SITE_ROOT` rather than plain relative paths,
specifically *because* the visible URL can be artificially deep
(`.../review/<id>`) even though the actual loaded document is `index.html`
sitting at the real root.

**The fragile assumption:** `404.html` hardcodes `pathSegmentsToKeep = 1` —
the number of path segments in front of the app's own paths (`/ReviewRepo/`
for this repo's current GitHub Pages project-page deployment). If the
deployment type ever changes — a custom domain, a user/org root site
(`username.github.io` itself, not a project subpage), or the repo gets
renamed in a way that changes the path depth — this constant needs updating
to match, or every `/review/<id>` link will redirect to the wrong place.

**Symptoms if this breaks:** clicking a review permalink (or loading a
shared link fresh) lands on the homepage instead of that specific review,
or redirects into a URL that itself 404s. Symptom shows up specifically for
deep links / shared links, not the homepage itself, which is a good
diagnostic signal that this is the culprit.

## `serve.ps1` is a hand-rolled approximation of GitHub Pages routing, not identical to it

`serve.ps1` was taught the same directory-index behavior GitHub Pages has
(serve `index.html` for a path ending in `/`) and a local equivalent of the
`/review/<id>` fallback (served directly, no redirect trick needed, since
it's a real server) — but it does **not** replicate GitHub Pages' Jekyll
processing (front matter, `_`-prefixed files/folders being ignored, etc.).
Something could work locally and still behave differently once actually
deployed, or vice versa. If a page loads fine at `localhost:8080` but not on
the live site (or the reverse), suspect a routing difference between the two
before assuming the code itself is wrong.

## Steam library import depends on a third-party CORS proxy staying up

`admin.html`'s "Load Steam Library" feature (Steam Web API key + SteamID in
Settings) routes every request through `corsproxy.io` (see `PROXY()` in
`admin/index.html`), since Steam's API has no CORS support and there's no
backend of our own to proxy it. If that public proxy is down, slow, or
rate-limiting, Steam import will fail or hang with no indication the actual
cause is external — it isn't this app's own bug. Predates this file; noted
here because it's exactly the kind of "why did this suddenly stop working"
issue this list exists to short-circuit.
