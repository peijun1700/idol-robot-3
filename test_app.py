from flask import Flask, jsonify, request
import os
import logging
import sys

# 配置日誌
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.before_request
def log_request_info():
    logger.debug('Headers: %s', request.headers)
    logger.debug('Body: %s', request.get_data())

@app.after_request
def after_request(response):
    logger.debug('Response: %s', response.get_data())
    return response

@app.route('/')
def index():
    logger.info('Accessing index route')
    return 'Hello, World!'

@app.route('/health')
def health():
    logger.info('Health check requested')
    try:
        # 進行一些基本的健康檢查
        # 1. 確保可以訪問文件系統
        if not os.access('.', os.W_OK):
            logger.error('Cannot write to current directory')
            return jsonify({'status': 'unhealthy', 'error': 'File system not writable'}), 500
            
        # 2. 檢查環境變量
        port = os.environ.get('PORT')
        if not port:
            logger.warning('PORT environment variable not set')
            
        logger.info('Health check passed')
        return jsonify({
            'status': 'healthy',
            'environment': {
                'python_version': sys.version,
                'port': port or '5000 (default)'
            }
        }), 200
        
    except Exception as e:
        logger.error('Health check failed: %s', str(e))
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info('Starting application on port %s', port)
    app.run(host='0.0.0.0', port=port)
