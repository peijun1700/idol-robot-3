from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_caching import Cache
from flask_compress import Compress
from flask_talisman import Talisman
from flask_cors import CORS
import os
import json
from pathlib import Path
import speech_recognition as sr
from werkzeug.utils import secure_filename
import soundfile as sf
from pydub import AudioSegment
import numpy as np
from datetime import datetime
import logging

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 安全性設置
Talisman(app, content_security_policy=None)
CORS(app)

# 效能優化
cache = Cache(app, config={'CACHE_TYPE': 'simple'})
Compress(app)

# 創建必要的目錄
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
AVATAR_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'avatars')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(AVATAR_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['AVATAR_FOLDER'] = AVATAR_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max-limit

ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'}
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_audio_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

class VoiceAssistant:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.commands = {}
        
        # 優化語音識別設置
        self.recognizer.energy_threshold = 4000
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.dynamic_energy_adjustment_damping = 0.15
        self.recognizer.dynamic_energy_ratio = 1.5
        self.recognizer.pause_threshold = 0.8
        
    def process_audio(self, audio_file):
        """處理音頻文件，進行優化和正規化"""
        try:
            # 讀取音頻文件
            data, samplerate = sf.read(audio_file)
            
            # 正規化音頻
            normalized_data = data / np.max(np.abs(data))
            
            # 保存處理後的音頻
            processed_path = audio_file.replace('.', '_processed.')
            sf.write(processed_path, normalized_data, samplerate)
            
            return processed_path
        except Exception as e:
            logger.error(f"音頻處理錯誤: {str(e)}")
            return audio_file

    @cache.memoize(timeout=300)
    def get_commands(self):
        """獲取指令列表（帶緩存）"""
        return self.commands

    def add_command(self, command_text, audio_path):
        """添加新指令"""
        try:
            processed_audio = self.process_audio(audio_path)
            self.commands[command_text] = processed_audio
            return True
        except Exception as e:
            logger.error(f"添加指令錯誤: {str(e)}")
            return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'}), 200

@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_image_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['AVATAR_FOLDER'], filename)
        file.save(file_path)
        return jsonify({'success': True, 'path': f'/avatars/{filename}'})
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/upload-audio', methods=['POST'])
def upload_audio():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        if file and allowed_audio_file(file.filename):
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            
            # 處理音頻
            try:
                assistant = VoiceAssistant()
                processed_path = assistant.process_audio(file_path)
                return jsonify({
                    'success': True,
                    'path': f'/uploads/{os.path.basename(processed_path)}',
                    'original_path': f'/uploads/{filename}'
                })
            except Exception as e:
                logger.error(f"音頻處理錯誤: {str(e)}")
                return jsonify({
                    'success': True,
                    'path': f'/uploads/{filename}'
                })
                
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        logger.error(f"上傳錯誤: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/avatars/<filename>')
def uploaded_avatar(filename):
    return send_from_directory(app.config['AVATAR_FOLDER'], filename)

@app.route('/<path:path>')
def serve_file(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
