const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { PDFDocument, degrees } = require('pdf-lib');
const sharp = require('sharp');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const RUNTIME_DIR = IS_VERCEL ? path.join('/tmp', 'fileflip') : ROOT;
const UPLOAD_DIR = path.join(RUNTIME_DIR, 'uploads');
const OUTPUT_DIR = path.join(RUNTIME_DIR, 'outputs');
const TEMP_DIR = path.join(RUNTIME_DIR, 'temp');

[UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Clean old files every hour during local/server deployments.
function cleanOldFiles() {
    const oneHourAgo = Date.now() - 3600000;
    [UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdir(dir, (err, files) => {
                if (err) return;
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    fs.stat(filePath, (err, stats) => {
                        if (err) return;
                        if (stats.mtimeMs < oneHourAgo) {
                            fs.unlink(filePath, () => {});
                        }
                    });
                });
            });
        }
    });
}

if (!IS_VERCEL) {
    const cleanupTimer = setInterval(cleanOldFiles, 3600000);
    cleanupTimer.unref();
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files with proper headers
app.use('/outputs', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    next();
}, express.static(OUTPUT_DIR, {
    setHeaders: (res, filePath) => {
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
}));

app.use(express.static(path.join(ROOT, 'public')));

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_, file, cb) => cb(null, true)
});

function publicFile(filePath) {
    return `/api/download/${encodeURIComponent(path.basename(filePath))}`;
}

function out(name) { 
    return path.join(OUTPUT_DIR, `${Date.now()}-${uuidv4()}-${name}`); 
}

async function cleanup(files=[]) { 
    for (const f of files) { 
        try { 
            if (f && fs.existsSync(f)) await fsp.unlink(f); 
        } catch(e) { console.error('Cleanup error:', e); }
    } 
}

function ok(res, filePath, message='Done') { 
    const fileName = path.basename(filePath);
    res.json({ 
        success: true, 
        message, 
        downloadUrl: publicFile(filePath), 
        filename: fileName 
    }); 
}

function fail(res, err) { 
    console.error(err); 
    res.status(500).json({ 
        success: false, 
        message: err.message || 'Something went wrong' 
    }); 
}

function parsePages(input, total) {
    if (!input) return [...Array(total).keys()];
    const selected = new Set();
    String(input).split(',').forEach(part => {
        part = part.trim();
        if (!part) return;
        if (part.includes('-')) {
            const [a,b] = part.split('-').map(n => parseInt(n.trim(),10));
            for (let i=Math.max(1,a); i<=Math.min(total,b); i++) selected.add(i-1);
        } else {
            const n = parseInt(part,10); 
            if (n>=1 && n<=total) selected.add(n-1);
        }
    });
    return [...selected].sort((a,b)=>a-b);
}

// FIXED: Function to find LibreOffice executable
function getLibreOfficePath() {
    // Common installation paths for Windows
    const possiblePaths = [
        'soffice', // If in PATH
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files\\LibreOffice\\program\\soffice.bin',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.bin',
    ];
    
    // Check each path
    for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
            console.log(`Found LibreOffice at: ${testPath}`);
            return testPath;
        }
    }
    
    // If not found, return 'soffice' as fallback (will try system PATH)
    console.log('LibreOffice not found in common paths, will try system PATH');
    return 'soffice';
}

// FIXED: Improved runLibreOffice function
async function runLibreOffice(inputPath, outputExt) {
    return new Promise((resolve, reject) => {
        // Check if input file exists
        if (!fs.existsSync(inputPath)) {
            reject(new Error(`Input file not found: ${inputPath}`));
            return;
        }
        
        const libreOfficePath = getLibreOfficePath();
        const outputFileName = `${Date.now()}-${uuidv4()}.${outputExt}`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);
        
        console.log(`Converting with LibreOffice: ${libreOfficePath}`);
        console.log(`Input: ${inputPath}`);
        console.log(`Output format: ${outputExt}`);
        
        // Execute LibreOffice
        execFile(libreOfficePath, [
            '--headless',
            '--convert-to', outputExt,
            '--outdir', OUTPUT_DIR,
            inputPath
        ], { timeout: 120000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('LibreOffice execution error:', error);
                reject(new Error(`LibreOffice conversion failed: ${error.message}. Please ensure LibreOffice is properly installed.`));
                return;
            }
            
            console.log('LibreOffice stdout:', stdout);
            if (stderr) console.log('LibreOffice stderr:', stderr);
            
            // The output file name is based on the input file name
            const inputBaseName = path.basename(inputPath, path.extname(inputPath));
            const expectedOutput = path.join(OUTPUT_DIR, `${inputBaseName}.${outputExt}`);
            
            console.log('Expected output path:', expectedOutput);
            
            // Check if file was created
            if (fs.existsSync(expectedOutput)) {
                // Rename to unique name to avoid conflicts
                fs.renameSync(expectedOutput, outputPath);
                console.log('Conversion successful:', outputPath);
                resolve(outputPath);
            } else {
                // Try to find any newly created file with the extension
                const files = fs.readdirSync(OUTPUT_DIR);
                const newFile = files.find(f => f.endsWith(`.${outputExt}`) && 
                    fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs > Date.now() - 5000);
                
                if (newFile) {
                    const newFilePath = path.join(OUTPUT_DIR, newFile);
                    fs.renameSync(newFilePath, outputPath);
                    console.log('Found and renamed conversion output:', outputPath);
                    resolve(outputPath);
                } else {
                    reject(new Error('Conversion failed - output file not created. LibreOffice may not be configured correctly.'));
                }
            }
        });
    });
}

// PDF Merge
app.post('/api/merge-pdf', upload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }
        
        const merged = await PDFDocument.create();
        for (const file of req.files) {
            const bytes = await fsp.readFile(file.path);
            const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const pages = await merged.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(p => merged.addPage(p));
        }
        
        const outPath = out('merged.pdf');
        const pdfBytes = await merged.save();
        await fsp.writeFile(outPath, pdfBytes);
        
        // Verify file was created
        if (!fs.existsSync(outPath)) {
            throw new Error('Failed to create output file');
        }
        
        await cleanup(req.files.map(f => f.path));
        ok(res, outPath, 'PDF files merged successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Split
app.post('/api/split-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = parsePages(req.body.pages, pdf.getPageCount());
        
        if (pages.length === 0) {
            throw new Error('No valid pages selected');
        }
        
        const zipPath = out('split-pages.zip');
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        
        for (const idx of pages) {
            const doc = await PDFDocument.create();
            const [p] = await doc.copyPages(pdf, [idx]);
            doc.addPage(p);
            const pdfBytes = await doc.save();
            archive.append(pdfBytes, { name: `page-${idx+1}.pdf` });
        }
        
        await archive.finalize();
        
        output.on('close', async () => {
            await cleanup([req.file.path]);
            ok(res, zipPath, 'PDF split completed');
        });
        
        output.on('error', (err) => {
            fail(res, err);
        });
        
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Compress
app.post('/api/compress-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const outPath = out('compressed.pdf');
        const compressedBytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
        await fsp.writeFile(outPath, compressedBytes);
        
        await cleanup([req.file.path]);
        ok(res, outPath, 'PDF compressed successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Rotate
app.post('/api/rotate-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const angle = Number(req.body.angle || 90);
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        pdf.getPages().forEach(page => page.setRotation(degrees(angle)));
        
        const outPath = out('rotated.pdf');
        const pdfBytes = await pdf.save();
        await fsp.writeFile(outPath, pdfBytes);
        
        await cleanup([req.file.path]);
        ok(res, outPath, 'PDF rotated successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Protect
app.post('/api/protect-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const outPath = out('protected.pdf');
        const password = req.body.password || '1234';
        const pdfBytes = await pdf.save({ 
            userPassword: password, 
            ownerPassword: password,
            encryptionKeySize: 128
        });
        await fsp.writeFile(outPath, pdfBytes);
        
        await cleanup([req.file.path]);
        ok(res, outPath, 'PDF protected successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Unlock
app.post('/api/unlock-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const outPath = out('unlocked.pdf');
        const pdfBytes = await pdf.save();
        await fsp.writeFile(outPath, pdfBytes);
        
        await cleanup([req.file.path]);
        ok(res, outPath, 'PDF unlocked successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// Image to PDF
app.post('/api/image-to-pdf', upload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded' });
        }
        
        const pdf = await PDFDocument.create();
        
        for (const file of req.files) {
            const imageBuffer = await fsp.readFile(file.path);
            const image = await sharp(imageBuffer).toBuffer();
            const metadata = await sharp(image).metadata();
            
            let img;
            if (metadata.format === 'png') {
                img = await pdf.embedPng(image);
            } else {
                img = await pdf.embedJpg(image);
            }
            
            const page = pdf.addPage([img.width, img.height]);
            page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        
        const outPath = out('images.pdf');
        const pdfBytes = await pdf.save();
        await fsp.writeFile(outPath, pdfBytes);
        
        await cleanup(req.files.map(f => f.path));
        ok(res, outPath, 'Images converted to PDF');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF Inspect
app.post('/api/pdf-inspect', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const sizeKb = (bytes.length / 1024).toFixed(2);
        const pageCount = pdf.getPageCount();
        
        await cleanup([req.file.path]);
        
        res.json({ 
            success: true, 
            pageCount: pageCount, 
            fileSize: `${sizeKb} KB`, 
            title: pdf.getTitle() || 'Not available', 
            author: pdf.getAuthor() || 'Not available', 
            subject: pdf.getSubject() || 'Not available', 
            producer: pdf.getProducer() || 'Not available', 
            estimatedReadingTime: `${Math.max(1, Math.ceil(pageCount * 1.5))} min` 
        });
    } catch(e) { 
        fail(res, e); 
    }
});

// Integrity Check
app.post('/api/integrity-check', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const bytes = await fsp.readFile(req.file.path);
        let status = 'File received successfully';
        let isValid = true;
        
        if (req.file.mimetype.includes('pdf') || path.extname(req.file.originalname).toLowerCase() === '.pdf') {
            try {
                await PDFDocument.load(bytes, { ignoreEncryption: true });
                status = 'PDF structure is valid and readable';
            } catch(e) {
                isValid = false;
                status = 'PDF file may be damaged: ' + e.message;
            }
        }
        
        const sizeKb = (bytes.length / 1024).toFixed(2);
        
        await cleanup([req.file.path]);
        
        res.json({ 
            success: isValid, 
            message: status, 
            size: `${sizeKb} KB`,
            filename: req.file.originalname
        });
    } catch(e) { 
        fail(res, new Error('File may be damaged or unreadable: ' + e.message)); 
    }
});

// Office to PDF
app.post('/api/office-to-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const p = await runLibreOffice(req.file.path, 'pdf');
        await cleanup([req.file.path]);
        ok(res, p, 'Office file converted to PDF');
    } catch(e) { 
        fail(res, e); 
    }
});

// PDF to Word
app.post('/api/pdf-to-docx', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const p = await runLibreOffice(req.file.path, 'docx');
        await cleanup([req.file.path]);
        ok(res, p, 'PDF converted to Word successfully');
    } catch(e) { 
        fail(res, e); 
    }
});

// Direct download endpoint
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    if (fs.existsSync(filepath)) {
        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('Download error:', err);
                res.status(500).json({ success: false, message: 'Download failed' });
            }
        });
    } else {
        res.status(404).json({ success: false, message: 'File not found' });
    }
});

// Health check
app.get('/api/health', (_, res) => res.json({ success: true, app: 'FileFlip', status: 'running' }));

if (require.main === module) {
    app.listen(PORT, () => console.log(`FileFlip running at http://localhost:${PORT}`));
}

module.exports = app;
