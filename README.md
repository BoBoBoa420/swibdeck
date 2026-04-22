# SwibDeck Scanner

TCG card scanner app by SwibSwap. Scans One Piece, Pokémon, Yugioh cards using your iPhone camera and shows live Thai Baht prices.

## Deploy to Vercel (5 minutes, free)

1. Go to https://vercel.com and sign up with GitHub
2. Click "Add New Project"
3. Upload this folder (drag & drop or connect GitHub repo)
4. Click Deploy — done!

Your app will be live at: https://swibdeck-yourname.vercel.app

## Open on iPhone

1. Open the Vercel URL in **Safari** on iPhone
2. Tap Share → "Add to Home Screen"
3. Now it works like a native app!

## Run locally

```bash
npm install
npm start
```
Then open http://localhost:3000 in Safari (or http://YOUR-MAC-IP:3000 on iPhone, same WiFi)

## Camera note

Camera access requires HTTPS or localhost. The app will NOT work inside Claude's artifact viewer (sandboxed iframe). Deploy to Vercel for full camera access.
