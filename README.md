# Co-Founder Dynamics

A very simple browser-based startup simulation that helps co-founders explore the decisions involved in taking a new company from an initial idea toward a seed round.

## About

Co-Founder Dynamics is a simple interactive game for entrepreneurship education. Players choose a founding team, make decisions at 12 startup milestones, and balance co-founder trust, company valuation, and entrepreneurial value.

Every choice affects the outcome. Strong communication and aligned incentives can lead to a sustainable partnership, while poor decisions may damage trust or end in a breakdown.

## Features

- Three founding-team scenarios
- 12 interactive startup milestones
- Career and run summaries
- Multiple partnership outcomes
- Local browser progress saving
- Optional sound effects
- No external dependencies

## Run Locally

Open `game.html` directly in a modern web browser, or serve the project locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000/game.html`.

## Project Files

- `game.html` - Application layout and interface
- `script.js` - Game logic, choices, progress, and outcomes
- `styles.css` - Responsive styling
- `audio_data.js` - In-browser audio data
