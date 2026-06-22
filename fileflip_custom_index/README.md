# FileFlip
Modern SaaS-style document conversion website with frontend + Node.js backend.

## Run locally
```bash
npm install
npm start
```
Open: http://localhost:3000

## Deploy to Vercel
Use `fileflip_custom_index` as the Vercel project root directory.

Recommended settings:
- Framework Preset: Other
- Install Command: `npm install`
- Build Command: leave empty
- Output Directory: leave empty

`vercel.json` routes all requests through `server.js`, which serves both the static frontend and the API routes.

Note: Vercel functions can write only to temporary storage. Uploaded and generated files are stored in `/tmp` during a function run and downloads are served through `/api/download/:filename`. Office conversions still require LibreOffice, which is not available in Vercel's standard serverless runtime.

## Working backend tools
- PDF Merge
- PDF Split
- PDF Compress
- PDF Rotate
- PDF Protect
- PDF Unlock attempt
- JPG/PNG to PDF
- PDF Inspector
- File Integrity Checker

## Office conversions
Word/Excel/PowerPoint to PDF and PDF to Word require LibreOffice installed:
- Windows: install LibreOffice, add soffice to PATH
- Ubuntu: sudo apt install libreoffice

## AdSense notes
Ad placeholders are included. Before applying for AdSense, publish original blog content, replace placeholder policies with complete legal text, connect Google Analytics/Search Console, and use a custom domain.


## Custom Homepage
This version uses the provided documentation-style index.html design and connects its upload modal to the Node/Express backend APIs.
