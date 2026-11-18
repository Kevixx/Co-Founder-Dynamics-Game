# Co-Founder Dynamics

A browser-based startup survival simulation that helps co-founders explore the decisions involved in taking a new company from an initial idea toward a seed round.

**Play Online:** https://kevixx.github.io/Co-Founder-Dynamics-Game

## About

Co-Founder Dynamics is an interactive game for entrepreneurship education (*38106 Developing an Entrepreneurial Mindset*). Players choose a founding origin, make decisions across 12 monthly startup milestones, and balance **Co-Founder Trust**, **Company Valuation**, **Entrepreneur Value**, and **Relational Debt**.

Every choice shapes downstream scenarios and the final investor verdict. Open communication and early governance build a resilient partnership, while avoided conversations compound into conflict eruptions or team breakdown.

## Features

- **3 Founding Origins**: *Hackathon Partners*, *University Friends*, and *Industry Acquaintances*
- **12 Monthly Milestones** (`Month 1` → `Seed Round`) with branching callbacks and mid-game Relational Debt repair
- **Built-in Narration Audio Player**: Bundled voice narration for every question and option with play/pause, scrubbing, previous/next controls, clickable segment pills, and speed toggle (`0.85x`–`1.5x`)
- **In-Game Course Reading**: *The Co-Founder Playbook* modal connecting equity, vesting, relational debt, and governance concepts directly to your current run (with print/PDF support)
- **End-of-Run Debrief**: 5 unlockable endings, leadership profile assessment, decision log, and SVG venture trajectory chart
- **Keyboard Shortcuts & Local Persistence**: Keys `1`–`4` to choose, `Enter`/`Space` to continue, Web Audio sound effects, and `localStorage` career tracking
- **Zero External Dependencies**: Runs completely client-side in any modern browser

## Run Locally

Open `index.html` directly in a modern web browser, or serve the project locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Project Files

- `index.html` - Application layout, Course Reading modal, and SVG tab icon
- `script.js` - 12-milestone simulation engine, Web Audio SFX, narration player, and trajectory debrief
- `styles.css` - Responsive dark-theme styling and print layout
- `audio_data.js` - Bundled in-memory MP3 narration clips (`window.GAME_AUDIO`)

## AI-Assisted Development

AI tooling was used as a collaborative development assistant alongside the author for:

- **Code & Debugging**: Converting the initial prototype into a zero-dependency client-side HTML/CSS/JS app, fixing layout/interaction bugs, and implementing mobile-compatible HTML5/Web Audio playback and keyboard shortcuts.
- **Narrative & Educational Content**: Expanding the 12-milestone co-founder scenario arc, dynamic conflict-debt callbacks, ending debriefs, and *The Co-Founder Playbook* reading section.
- **UI & Media Assets**: Styling the responsive dark theme, inline SVG trajectory chart, interactive audio player, SVG favicon, and generating/converting the bundled text-to-speech MP3 narration clips (`ffmpeg`).

All game direction, course alignment, testing, and deployment were guided and reviewed by the author.
