# mj2603.github.io

Personal portfolio site — [mj2603.github.io](https://mj2603.github.io)

## Deploy to GitHub Pages (5 minutes)

### 1. Create the repo
Go to GitHub and create a **new repository** named exactly:
```
mj2603.github.io
```
This special name tells GitHub to serve it as your personal site at `https://mj2603.github.io`.

### 2. Add your files
Upload these files to the root of the repo:
- `index.html` — the main site (this file)
- `resume.pdf` — export your CV as PDF and name it `resume.pdf`

The quickest way: use the GitHub web UI → **Add file → Upload files**.

### 3. Enable GitHub Pages
Go to **Settings → Pages** in your repo.  
Under "Build and deployment", set source to **Deploy from a branch**, branch `main`, folder `/root`.  
Click Save.

Your site will be live at `https://mj2603.github.io` within ~1 minute.

---

## Customising

| What | Where in `index.html` |
|---|---|
| Bio text | `.hero-bio` paragraph |
| Resume link | `href="./resume.pdf"` in `.h-link` |
| Add a photo | Replace `.logo-mark` with an `<img>` tag |
| Accent color | `--accent: #1D4ED8` in `:root` |

## Custom domain (optional)
If you own a domain (e.g. `mrityunjay.dev`):
1. Add a file named `CNAME` to the repo with your domain on one line: `mrityunjay.dev`
2. Point your domain's DNS to GitHub Pages IPs (see GitHub docs)
3. Enable "Enforce HTTPS" in Settings → Pages
