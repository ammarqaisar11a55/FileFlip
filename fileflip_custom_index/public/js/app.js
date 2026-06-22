const $=(q)=>document.querySelector(q);
const $$=(q)=>document.querySelectorAll(q);
const toast=$('#toast');

function showToast(msg){
    if(!toast)return;
    toast.textContent=msg;
    toast.style.display='block';
    setTimeout(()=>toast.style.display='none',3000);
}

const saved=localStorage.getItem('theme')||'light';
document.documentElement.dataset.theme=saved;
$$('.theme-toggle').forEach(b=>b.onclick=()=>{
    const n=document.documentElement.dataset.theme==='dark'?'light':'dark';
    document.documentElement.dataset.theme=n;
    localStorage.setItem('theme',n);
});

const menu=$('.menu-btn'),links=$('.links');
if(menu)menu.onclick=()=>links.classList.toggle('open');

const io=new IntersectionObserver(es=>es.forEach(e=>{
    if(e.isIntersecting)e.target.classList.add('visible');
}),{threshold:.12});
$$('.reveal').forEach(el=>io.observe(el));

// Function to handle file download
async function downloadFile(url, filename) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        
        showToast('File downloaded successfully!');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message);
    }
}

const toolMap = {
    'pdf-to-word': { title: 'PDF to Word', api: '/api/pdf-to-docx', accept: '.pdf', multiple: false, extra: '' },
    'word-to-pdf': { title: 'Word to PDF', api: '/api/office-to-pdf', accept: '.doc,.docx', multiple: false, extra: '' },
    'jpg-to-pdf': { title: 'JPG to PDF', api: '/api/image-to-pdf', accept: '.jpg,.jpeg', multiple: true, extra: '' },
    'png-to-pdf': { title: 'PNG to PDF', api: '/api/image-to-pdf', accept: '.png', multiple: true, extra: '' },
    'merge-pdf': { title: 'PDF Merge', api: '/api/merge-pdf', accept: '.pdf', multiple: true, extra: '' },
    'split-pdf': { title: 'PDF Split', api: '/api/split-pdf', accept: '.pdf', multiple: false, extra: '<label>Pages e.g. 1,3,5-7</label><input name="pages" placeholder="1-3">' },
    'compress-pdf': { title: 'PDF Compress', api: '/api/compress-pdf', accept: '.pdf', multiple: false, extra: '' },
    'unlock-pdf': { title: 'PDF Unlock', api: '/api/unlock-pdf', accept: '.pdf', multiple: false, extra: '' },
    'protect-pdf': { title: 'PDF Protect', api: '/api/protect-pdf', accept: '.pdf', multiple: false, extra: '<label>Password</label><input name="password" type="password" placeholder="Enter password">' },
    'rotate-pdf': { title: 'Rotate PDF', api: '/api/rotate-pdf', accept: '.pdf', multiple: false, extra: '<label>Rotation</label><select name="angle"><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select>' },
    'organize-pdf': { title: 'Organize PDF Pages', api: '/api/split-pdf', accept: '.pdf', multiple: false, extra: '<label>Keep / reorder pages e.g. 2,1,4</label><input name="pages" placeholder="1,2,3">' },
    'excel-to-pdf': { title: 'Excel to PDF', api: '/api/office-to-pdf', accept: '.xls,.xlsx', multiple: false, extra: '' },
    'powerpoint-to-pdf': { title: 'PowerPoint to PDF', api: '/api/office-to-pdf', accept: '.ppt,.pptx', multiple: false, extra: '' },
    'pdf-to-jpg': { title: 'PDF to JPG', api: '/api/integrity-check', accept: '.pdf', multiple: false, extra: '<p class="muted">Demo mode: checks file. For real PDF image export add Poppler.</p>' },
    'pdf-to-png': { title: 'PDF to PNG', api: '/api/integrity-check', accept: '.pdf', multiple: false, extra: '<p class="muted">Demo mode: checks file. For real PDF image export add Poppler.</p>' },
    'repair-pdf': { title: 'Repair Corrupted PDF', api: '/api/integrity-check', accept: '.pdf', multiple: false, extra: '' },
    'repair-word': { title: 'Repair Word Files', api: '/api/integrity-check', accept: '.doc,.docx', multiple: false, extra: '' },
    'repair-excel': { title: 'Repair Excel Files', api: '/api/integrity-check', accept: '.xls,.xlsx', multiple: false, extra: '' },
    'recover-text': { title: 'Recover Text', api: '/api/integrity-check', accept: '.pdf,.doc,.docx,.txt', multiple: false, extra: '' },
    'integrity-checker': { title: 'File Integrity Checker', api: '/api/integrity-check', accept: '*', multiple: false, extra: '' },
    'resume-converter': { title: 'Resume PDF Converter', api: '/api/office-to-pdf', accept: '.doc,.docx', multiple: false, extra: '' },
    'resume-formatting': { title: 'Resume Formatting Tool', api: '/api/integrity-check', accept: '.pdf,.doc,.docx', multiple: false, extra: '<p>Upload resume to check file readability and size.</p>' },
    'pdf-inspector': { title: 'Smart PDF Inspector', api: '/api/pdf-inspect', accept: '.pdf', multiple: false, extra: '' }
};

function initTool() {
    const page = $('#tool-page');
    if (!page) return;
    
    const slug = new URLSearchParams(location.search).get('tool') || 'merge-pdf';
    const t = toolMap[slug] || toolMap['merge-pdf'];
    
    $('#tool-title').textContent = t.title;
    $('#tool-desc').textContent = 'Upload your file and FileFlip will process it.';
    $('#tool-extra').innerHTML = t.extra;
    
    const input = $('#file');
    input.accept = t.accept;
    input.multiple = t.multiple;
    
    $('#tool-form').onsubmit = async (e) => {
        e.preventDefault();
        if (!input.files.length) return showToast('Please select file first');
        
        const fd = new FormData(e.target);
        
        if (t.multiple) {
            fd.delete('file');
            [...input.files].forEach(f => fd.append('files', f));
        }
        
        const btn = $('#process-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';
        btn.disabled = true;
        
        try {
            const r = await fetch(t.api, { method: 'POST', body: fd });
            const data = await r.json();
            const box = $('#result');
            box.style.display = 'block';
            
            if (data.success) {
                if (data.downloadUrl) {
                    // Handle download with proper file fetching
                    const filename = data.filename || 'download';
                    box.innerHTML = `
                        <div style="background:rgba(0,200,83,.1);color:var(--green);padding:.8rem;border-radius:10px;font-weight:700;margin-bottom:1rem">
                            ✓ ${data.message || 'Processing successful!'}
                        </div>
                        <button class="btn" onclick="downloadFile('${data.downloadUrl}', '${filename}')" style="width:100%">
                            ⬇ Download File
                        </button>
                    `;
                } else {
                    box.innerHTML = `
                        <div style="background:rgba(0,200,83,.1);color:var(--green);padding:.8rem;border-radius:10px;font-weight:700;margin-bottom:1rem">
                            ✓ ${data.message || 'Success!'}
                        </div>
                        <pre style="white-space:pre-wrap;background:var(--cream);padding:1rem;border-radius:12px">${JSON.stringify(data, null, 2)}</pre>
                    `;
                }
            } else {
                box.innerHTML = `
                    <div style="background:rgba(255,77,0,.1);color:var(--accent);padding:.8rem;border-radius:10px;font-weight:700;margin-bottom:1rem">
                        ✗ ${data.message || 'Processing failed'}
                    </div>
                `;
            }
        } catch(err) {
            showToast('Server error: ' + err.message);
            const box = $('#result');
            box.style.display = 'block';
            box.innerHTML = `
                <div style="background:rgba(255,77,0,.1);color:var(--accent);padding:.8rem;border-radius:10px;font-weight:700;margin-bottom:1rem">
                    ✗ Error: ${err.message}
                </div>
            `;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };
}

// Make downloadFile available globally
window.downloadFile = downloadFile;

initTool();