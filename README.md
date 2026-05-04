# Jobstream Widget for AI Central

Production-ready job board widget that pulls from your Jobstream XML feed and can be embedded in your beehiiv website.

## Design

- Swiss minimalist aesthetic matching AI Central brand
- Inter typeface, Baby Powder (#FFFDFA) background
- Transit-inspired clean lines and borders
- Fully responsive for iframe embedding

## Features

- Real-time job feed from Jobstream
- Search by title, company, description
- Filter by location type (Remote/On-site/Hybrid) and employment type
- Salary range display
- Relative date formatting ("2d ago", "1w ago")
- Error handling with retry
- Mobile responsive

---

## Quick Deploy to Vercel (5 minutes)

### Step 1: Prepare files

You need these files from this folder:
- `package.json`
- `index.html`
- `vite.config.js`
- `vercel.json`
- `src/main.jsx`
- `src/JobstreamWidget.jsx`
- `api/jobs.js`

### Step 2: Deploy

**Option A: Deploy with GitHub**

1. Create a new repo on GitHub
2. Upload all the files above
3. Go to vercel.com and sign in
4. Click "Add New" → "Project"
5. Import your GitHub repo
6. Click "Deploy"
7. Done - - Vercel will give you a URL like `https://jobstream-widget.vercel.app`

**Option B: Deploy with Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# From this folder, run:
vercel

# Follow prompts, deploy
```

### Step 3: Embed in beehiiv

1. Go to your beehiiv website builder
2. Add an "Embed" or "HTML" block
3. Paste this code:

```html
<iframe 
  src="https://YOUR-VERCEL-URL.vercel.app" 
  width="100%" 
  height="800" 
  frameborder="0"
  style="border: none; display: block;"
></iframe>
```

Replace `YOUR-VERCEL-URL` with your actual Vercel deployment URL

---

## How it works

**Frontend** (`src/JobstreamWidget.jsx`)
- React component that displays jobs
- Fetches from `/api/jobs` endpoint
- Handles search, filtering, error states

**Backend** (`api/jobs.js`)
- Serverless function that runs on Vercel
- Fetches XML from Jobstream
- Adds CORS headers so browser can access it
- Returns XML to frontend

This architecture solves CORS issues and keeps your feed URL private

---

## Customization

### Change colors

In `src/JobstreamWidget.jsx`, update the `styles` object:

```javascript
container: {
  backgroundColor: '#FFFDFA',  // Change background
  // ...
},
headerLine: {
  backgroundColor: '#000',      // Change accent color
  // ...
}
```

### Change fonts

In `index.html`, swap the Google Fonts link and update `fontFamily` in styles

### Add your logo

In `src/JobstreamWidget.jsx`, add an image in the header section:

```javascript
<header style={styles.header}>
  <img src="/your-logo.png" alt="AI Central" style={{height: '40px'}} />
  <div style={styles.headerLine}></div>
  // ...
</header>
```

---

## Troubleshooting

**"Unable to load jobs" error**

1. Check that `api/jobs.js` deployed correctly
   - Go to your Vercel dashboard → Functions tab
   - You should see `/api/jobs`

2. Test the API directly
   - Visit `https://YOUR-URL.vercel.app/api/jobs`
   - You should see XML output

3. Check Jobstream feed access
   - Verify your feed URL is still active
   - Contact Jobstream support if needed

**Widget not showing in iframe**

1. Check iframe height - - might need to increase from 800px
2. Make sure there's no X-Frame-Options blocking embeds
3. Try adding `allow="*"` to iframe attributes

**Styling looks broken**

1. Verify Inter font is loading (check Network tab in browser DevTools)
2. Check that Baby Powder color (#FFFDFA) is rendering
3. Clear browser cache

---

## Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

---

## Support

Questions? Email alex@thecentral.ai
