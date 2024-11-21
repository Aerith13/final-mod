from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import os
import cv2
import numpy as np
from PIL import Image
import base64
import io
import fitz  # PyMuPDF
import logging
from paddleocr import PaddleOCR, PPStructure
import wget
from pathlib import Path
import json
import pandas as pd

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask application
app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Get the base directory of paddleocr package
paddleocr_path = Path(__file__).parent / '.venv' / 'Lib' / 'site-packages' / 'paddleocr'

def download_models():
    import wget
    import os
    
    if not os.path.exists('inference'):
        os.makedirs('inference')
    
    models = {
        'det': 'https://paddleocr.bj.bcebos.com/dygraph_v2.0/table/en_ppocr_mobile_v2.0_table_det_infer.tar',
        'rec': 'https://paddleocr.bj.bcebos.com/dygraph_v2.0/table/en_ppocr_mobile_v2.0_table_rec_infer.tar',
        'table': 'https://paddleocr.bj.bcebos.com/ppstructure/models/slanet/en_ppstructure_mobile_v2.0_SLANet_infer.tar'
    }
    
    for model_type, url in models.items():
        tar_file = os.path.join('inference', os.path.basename(url))
        if not os.path.exists(tar_file):
            wget.download(url, tar_file)
            os.system(f'cd inference && tar xf {os.path.basename(url)}')

# Initialize PPStructure with English models
table_engine = PPStructure(
    table=True,
    show_log=True,
    lang='en',
    det_model_dir='inference/en_PP-OCRv3_det_infer',
    rec_model_dir='inference/en_PP-OCRv3_rec_infer',
    table_model_dir='inference/en_ppstructure_mobile_v2.0_SLANet_infer',
    rec_char_dict_path=str(paddleocr_path / 'ppocr/utils/en_dict.txt'),
    table_char_dict_path=str(paddleocr_path / 'ppocr/utils/dict/table_structure_dict.txt'),
    det_limit_side_len=736,
    det_limit_type='min',
    rec_image_shape='3,32,320'
)

# Initialize PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang='en')

def convert_pdf_to_images(pdf_path):
    """Convert PDF to list of PIL Images without using Poppler"""
    pdf_document = fitz.open(pdf_path)
    images = []
    
    for page_number in range(pdf_document.page_count):
        page = pdf_document[page_number]
        pix = page.get_pixmap()
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    
    pdf_document.close()
    return images

@app.route('/extract-table', methods=['POST'])
def extract_table():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Get selection coordinates if provided
        selection = request.form.get('selection')
        if selection:
            selection = json.loads(selection)
        
        # Save the preview image
        filename = secure_filename('preview.jpg')
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        logger.debug(f"Processing file: {filepath}")
        
        try:
            # If selection coordinates provided, crop the image first
            if selection:
                img = Image.open(filepath)
                # Add padding around selection
                padding = 20
                img = img.crop((
                    max(0, selection['x'] - padding),
                    max(0, selection['y'] - padding),
                    min(img.width, selection['x'] + selection['width'] + padding),
                    min(img.height, selection['y'] + selection['height'] + padding)
                ))
                # Resize if too small
                if img.width < 640 or img.height < 640:
                    ratio = 640.0 / min(img.width, img.height)
                    new_size = (int(img.width * ratio), int(img.height * ratio))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                crop_path = filepath.rsplit('.', 1)[0] + '_crop.jpg'
                img.save(crop_path, quality=95)
                filepath = crop_path
            
            result = table_engine(filepath)
            logger.debug(f"Table engine result: {result}")
            
            # Extract table data
            tables = []
            for region in result:
                if isinstance(region, dict):
                    if region.get('type') == 'table':
                        if 'res' in region:
                            if isinstance(region['res'], dict):
                                if 'html' in region['res']:
                                    tables.append(region['res']['html'])
                                elif 'table' in region['res']:
                                    tables.append(region['res']['table'])
                            else:
                                tables.append(region['res'])
            
            if not tables:
                logger.warning("No tables detected in image")
                return jsonify({'error': 'No tables detected in image'}), 400
            
            return jsonify({
                'success': True,
                'tables': tables[0]
            })
            
        except Exception as e:
            logger.error(f"Table engine error: {str(e)}")
            return jsonify({'error': f'Table processing error: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        filename = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filename)
        return jsonify({'message': 'File uploaded successfully', 'filename': file.filename}), 200
    
    return jsonify({'error': 'File upload failed'}), 400

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)