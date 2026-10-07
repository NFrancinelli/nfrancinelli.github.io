# nfrancinelli.github.io

My portfolio site. Astro + MDX, deployed to GitHub Pages.

## Commands

```sh
npm install
npm run dev       # localhost:4321, live reload
npm run build     # build into dist/
npm run check     # type-check
npx astro dev stop
```

## New project

One folder per project in `src/content/projects/`:

```
src/content/projects/my-project/
├── en.mdx        # required
├── fr.mdx        # optional, falls back to EN with a notice
└── images/       # figures + card thumbnail
```

Start from a copy of `vi-slam/en.mdx`. Front matter:

| Field | Notes |
| --- | --- |
| `title`, `summary` | Card title, one-paragraph summary |
| `status` | `complete` or `in-progress` (red stamp) |
| `date` | Finish date, or start date if in progress (`2026-10-05`). Sorts newest first, card shows the year |
| `thumbnail`, `thumbnailAlt` | Card image (`./images/...`) + alt text |
| `role`, `team`, `stack`, `hardware`, `links` | Facts table at the top of the page |

Figures and video in the body:

```mdx
import photo from './images/photo.png';

<Figure src={photo} alt="What the image shows" caption="What to notice." />
<Figure pair={[{ src: a, alt: '...' }, { src: b, alt: '...' }]} caption="Side by side." />
<Video src="/media/my-project/demo.mp4" poster="/media/my-project/poster.jpg" caption="..." />
```

- `images/` gets resized and compressed at build.
- Videos and PDFs go in `public/media/<project>/`, served as-is.
- Max 100 MB per file (GitHub limit).

## CV

- `public/cv/Francinelli_CV_EN.pdf` and `public/cv/Francinelli_CV_FR.pdf`
- The CV link shows up in the header and on About once the file exists. FR falls back to EN.
- Public versions only: **no phone number**.

## Where things live

- `src/site.ts`: contact links, CV file names, GoatCounter code (empty = analytics off)
- `src/i18n.ts`: nav and UI labels, EN + FR
- `src/components/AboutPage.astro`: About page text
- `src/scripts/explorer.ts`: home page animation

## Deploy

Push to `main` → `.github/workflows/deploy.yml` builds and publishes to https://nfrancinelli.github.io.

First-time setup:
- [ ] Public repo `nfrancinelli.github.io` under `NFrancinelli`
- [ ] Settings → Pages → Source: **GitHub Actions**

Repo is public with full history, so nothing private gets committed: no phone number, no client details, no unpublishable PDFs.

## Home page animation

Frontier-based multi-robot exploration on the page grid (`src/scripts/explorer.ts`):

- Each robot senses cells within its sensor radius. Walls block line of sight.
- Goal selection: unclaimed frontiers (known free cells next to unknown ones), tried nearest-first by octile distance, each planned with A* (8-connected, no corner cutting, extra cost near walls). Stops once no remaining frontier can beat the best path found.
- Claims keep the robots spread out.
- Map fully explored → fade out → new random map.
- The headline box counts as an obstacle.
- Visitor controls: draw/erase walls, pause, new map, 1–6 robots, show/hide paths.
- Pauses when the tab is hidden or the map is off-screen.
- Reduced motion → static finished run.
