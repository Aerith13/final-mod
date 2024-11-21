const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
const viewerContainer = document.querySelector('.viewer-container');

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

// Highlight drop zone when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

// Handle dropped files
dropZone.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', handleFiles, false);

function preventDefaults (e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    dropZone.classList.add('dragover');
}

function unhighlight(e) {
    dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles({target: {files: files}});
}

let currentFile = null;

function handleFiles(e) {
    const files = [...e.target.files];
    currentFile = files[0];
    files.forEach(file => {
        uploadFile(file);
        displayDocument(file);
    });
}

function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log('Success:', data);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

let currentPdfDoc = null;
let currentPage = 1;
const canvas = document.getElementById('viewer-canvas');
const ctx = canvas.getContext('2d');

function showViewer() {
    viewerContainer.classList.add('active');
    dropZone.style.minHeight = '150px';
    
    // Smooth transition for document viewer
    setTimeout(() => {
        const viewer = document.getElementById('document-viewer');
        viewer.style.overflow = 'auto';
    }, 300);
}

function displayDocument(file) {
    showViewer();
    if (file.type === 'application/pdf') {
        displayPDF(file);
    } else if (file.type.startsWith('image/')) {
        displayImage(file);
    }
}

async function displayPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        currentPdfDoc = pdf;
        document.getElementById('page-count').textContent = pdf.numPages;
        document.getElementById('page-num').textContent = '1';
        await renderPage(1);
    } catch (error) {
        console.error('Error displaying PDF:', error);
    }
}

async function renderPage(pageNumber) {
    try {
        currentPage = pageNumber;
        document.getElementById('page-num').textContent = pageNumber;
        
        const page = await currentPdfDoc.getPage(pageNumber);
        const containerWidth = document.getElementById('document-viewer').clientWidth - 40;
        const viewport = page.getViewport({ scale: 1.0 });
        
        let scale = containerWidth / viewport.width;
        scale = Math.max(scale, 0.8);
        
        const scaledViewport = page.getViewport({ scale });
        
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        
        const viewer = document.getElementById('document-viewer');
        viewer.style.height = `${scaledViewport.height + 40}px`;
        
        await page.render({
            canvasContext: ctx,
            viewport: scaledViewport
        }).promise;
    } catch (error) {
        console.error('Error rendering page:', error);
    }
}

function displayImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const containerWidth = document.getElementById('document-viewer').clientWidth - 40;
            const scale = Math.max(containerWidth / img.width, 0.8);
            
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            
            const viewer = document.getElementById('document-viewer');
            viewer.style.height = `${canvas.height + 40}px`;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            document.getElementById('page-count').textContent = '1';
            document.getElementById('page-num').textContent = '1';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Add event listeners for PDF navigation
document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPdfDoc && currentPage > 1) {
        renderPage(currentPage - 1);
    }
});

document.getElementById('next-page').addEventListener('click', () => {
    if (currentPdfDoc && currentPage < currentPdfDoc.numPages) {
        renderPage(currentPage + 1);
    }
});

document.getElementById('page-num').textContent = currentPage;

// Add click handler for the entire drop zone
dropZone.addEventListener('click', () => {
    fileInput.click();
});

// Prevent the click event from triggering twice
fileInput.addEventListener('click', (e) => {
    e.stopPropagation();
});

let isSelecting = false;
let isDrawing = false;
let startX, startY;

const selectBtn = document.getElementById('select-area');
const documentViewer = document.getElementById('document-viewer');
const selectionBox = document.getElementById('selection-box');

selectBtn.addEventListener('click', () => {
    isSelecting = !isSelecting;
    selectBtn.classList.toggle('active');
    documentViewer.classList.toggle('selecting');
    
    if (!isSelecting) {
        selectionBox.style.display = 'none';
    }
});

documentViewer.addEventListener('mousedown', (e) => {
    if (!isSelecting) return;
    
    isDrawing = true;
    const rect = documentViewer.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0';
    selectionBox.style.height = '0';
});

documentViewer.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = documentViewer.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    selectionBox.style.width = Math.abs(width) + 'px';
    selectionBox.style.height = Math.abs(height) + 'px';
    selectionBox.style.left = (width < 0 ? currentX : startX) + 'px';
    selectionBox.style.top = (height < 0 ? currentY : startY) + 'px';
});

documentViewer.addEventListener('mouseup', () => {
    isDrawing = false;
    if (isSelecting) {
        selectedArea = {
            x: parseInt(selectionBox.style.left),
            y: parseInt(selectionBox.style.top),
            width: parseInt(selectionBox.style.width),
            height: parseInt(selectionBox.style.height),
            page: currentPage
        };
    }
});

// Add click handler for extract button
document.getElementById('extract-table').addEventListener('click', () => {
    const selectionBox = document.getElementById('selection-box');
    const canvas = document.getElementById('viewer-canvas');
    
    // Get selection coordinates relative to the canvas
    const selection = {
        x: parseInt(selectionBox.style.left),
        y: parseInt(selectionBox.style.top),
        width: parseInt(selectionBox.style.width),
        height: parseInt(selectionBox.style.height)
    };

    // Convert canvas to blob
    canvas.toBlob((blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'preview.jpg');
        formData.append('selection', JSON.stringify(selection));

        fetch('/extract-table', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayExtractedTable(data.tables);
            } else {
                alert(data.error || 'Failed to extract table');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to extract table');
        });
    }, 'image/jpeg');
});

function displayExtractedTable(tableHtml) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'extracted-table-container';
    
    // Create a temporary div to parse the HTML string
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHtml;
    const table = tempDiv.querySelector('table');
    table.className = 'extracted-table';
    
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export to Excel';
    exportBtn.className = 'export-btn';
    exportBtn.onclick = () => {
        // Convert HTML table to array format for Excel export
        const rows = Array.from(table.querySelectorAll('tr'));
        const tableData = rows.map(row => 
            Array.from(row.querySelectorAll('td,th')).map(cell => cell.textContent)
        );
        exportToExcel(tableData);
    };
    
    tableContainer.appendChild(table);
    tableContainer.appendChild(exportBtn);
    
    const existingContainer = document.querySelector('.extracted-table-container');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    const viewerContainer = document.querySelector('.viewer-container');
    viewerContainer.appendChild(tableContainer);
}

function exportToExcel(tableData) {
    const ws = XLSX.utils.aoa_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extracted Table');
    XLSX.writeFile(wb, 'extracted_table.xlsx');
}
