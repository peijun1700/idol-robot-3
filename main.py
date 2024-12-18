from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_caching import Cache
from flask_compress import Compress
from flask_talisman import Talisman
from flask_cors import CORS
import os
import json
from pathlib import Path
import speech_recognition as sr
import pygame
import threading
from werkzeug.utils import secure_filename
import librosa
import soundfile as sf
from pydub import AudioSegment
import numpy as np
from datetime import datetime
import logging

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.')

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

# 監控端點
# metrics.info('app_info', 'Application info', version='1.0.0')

ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'}
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_audio_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

class VoiceAssistant:
    def __init__(self):
        self.commands = {}
        self.recognizer = sr.Recognizer()
        self.load_commands()
        
        # 優化語音識別設置
        self.recognizer.energy_threshold = 4000
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.dynamic_energy_adjustment_damping = 0.15
        self.recognizer.dynamic_energy_ratio = 1.5
        self.recognizer.pause_threshold = 0.8
        
    def process_audio(self, audio_file):
        """處理音頻文件，進行優化和正規化"""
        try:
            # 使用librosa進行音頻處理
            y, sr = librosa.load(audio_file)
            
            # 音頻正規化
            y_normalized = librosa.util.normalize(y)
            
            # 降噪
            y_denoised = librosa.effects.preemphasis(y_normalized)
            
            # 保存處理後的音頻
            processed_path = audio_file.replace('.', '_processed.')
            sf.write(processed_path, y_denoised, sr)
            
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
            # 處理音頻
            processed_audio = self.process_audio(audio_path)
            self.commands[command_text] = processed_audio
            self.save_commands()
            return True
        except Exception as e:
            logger.error(f"添加指令錯誤: {str(e)}")
            return False

    def load_commands(self):
        # TODO: 從本地文件加載設定
        pass

    def save_commands(self):
        # TODO: 保存設定到本地文件
        pass

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['avatar']
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
        if 'audio' not in request.files:
            return jsonify({'error': '沒有檔案'}), 400
            
        file = request.files['audio']
        if file.filename == '':
            return jsonify({'error': '沒有選擇檔案'}), 400
            
        if file and allowed_audio_file(file.filename):
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # 確保上傳目錄存在
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            file.save(file_path)
            
            # 處理音頻
            try:
                processed_path = VoiceAssistant().process_audio(file_path)
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
                
        return jsonify({'error': '不支援的檔案類型'}), 400
        
    except Exception as e:
        logger.error(f"上傳錯誤: {str(e)}")
        return jsonify({'error': '上傳過程中發生錯誤'}), 500

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/avatars/<path:filename>')
def uploaded_avatar(filename):
    return send_from_directory(app.config['AVATAR_FOLDER'], filename)

@app.route('/<path:path>')
def serve_file(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    # 在開發環境中運行
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)
else:
    # 在生產環境中運行
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.setLevel(gunicorn_logger.level)
