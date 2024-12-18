class AudioProcessor {
    constructor() {
        this.wavesurfer = null;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.commandsCache = new Map();
        
        // 優化分析器設置
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;
        
        // 初始化音頻處理器
        this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
        this.processor.connect(this.audioContext.destination);
        
        // 初始化降噪處理
        this.noiseReducer = new NoiseReducer(this.audioContext);
    }

    initWaveSurfer(container) {
        this.wavesurfer = WaveSurfer.create({
            container: container,
            waveColor: '#4CAF50',
            progressColor: '#2196F3',
            cursorColor: '#FF5722',
            barWidth: 2,
            barRadius: 3,
            cursorWidth: 1,
            height: 100,
            barGap: 2,
            responsive: true,
            normalize: true,
            partialRender: true
        });
        
        // 添加時間軸插件
        this.wavesurfer.addPlugin(WaveSurfer.timeline.create({
            container: '#wave-timeline',
            primaryLabelInterval: 10,
            secondaryLabelInterval: 5
        }));
    }

    async startListening() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupAudioProcessing(stream);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw error;
        }
    }

    setupAudioProcessing(stream) {
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);
        this.analyser.connect(this.processor);
        
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
        });
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            this.processRecording();
        };
        
        this.mediaRecorder.start(100);
        this.isRecording = true;
    }

    stopListening() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }

    async processRecording() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
        this.audioChunks = [];
        
        // 應用音頻處理
        const processedBlob = await this.applyAudioProcessing(audioBlob);
        
        // 更新波形顯示
        const audioUrl = URL.createObjectURL(processedBlob);
        this.wavesurfer.load(audioUrl);
    }

    async applyAudioProcessing(audioBlob) {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // 應用降噪
        const denoisedBuffer = await this.noiseReducer.process(audioBuffer);
        
        // 正規化音量
        const normalizedBuffer = this.normalizeAudio(denoisedBuffer);
        
        // 轉換回Blob
        const processedBlob = await this.audioBufferToBlob(normalizedBuffer);
        return processedBlob;
    }

    normalizeAudio(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const maxAmplitude = Math.max(...channelData.map(Math.abs));
        
        if (maxAmplitude > 0) {
            const scaleFactor = 0.99 / maxAmplitude;
            for (let i = 0; i < channelData.length; i++) {
                channelData[i] *= scaleFactor;
            }
        }
        
        return audioBuffer;
    }

    async audioBufferToBlob(audioBuffer) {
        const wavEncoder = new WaveEncoder();
        const wavData = wavEncoder.encode({
            sampleRate: audioBuffer.sampleRate,
            channelData: [audioBuffer.getChannelData(0)]
        });
        
        return new Blob([wavData], { type: 'audio/wav' });
    }

    // 指令管理相關方法
    async handleFileUpload(file, commandText, audioPath) {
        try {
            if (this.commandsCache.has(commandText)) {
                return this.commandsCache.get(commandText);
            }
            
            const formData = new FormData();
            formData.append('audio', file);
            formData.append('command', commandText);
            
            const response = await fetch('/upload-audio', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.success) {
                this.commandsCache.set(commandText, result);
                return result;
            }
            throw new Error(result.error || '上傳失敗');
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }
}

// 降噪處理器類
class NoiseReducer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.noiseProfile = null;
    }
    
    async process(audioBuffer) {
        // 如果沒有噪音配置，先採樣環境噪音
        if (!this.noiseProfile) {
            this.noiseProfile = this.sampleEnvironmentNoise(audioBuffer);
        }
        
        const inputData = audioBuffer.getChannelData(0);
        const outputData = new Float32Array(inputData.length);
        
        // 應用頻譜減法降噪
        for (let i = 0; i < inputData.length; i++) {
            outputData[i] = inputData[i] - (this.noiseProfile * 0.5);
        }
        
        // 創建新的AudioBuffer
        const processedBuffer = this.audioContext.createBuffer(
            1,
            outputData.length,
            audioBuffer.sampleRate
        );
        processedBuffer.getChannelData(0).set(outputData);
        
        return processedBuffer;
    }
    
    sampleEnvironmentNoise(audioBuffer) {
        const data = audioBuffer.getChannelData(0);
        const sampleSize = Math.min(data.length, 2048);
        let sum = 0;
        
        // 計算環境噪音的平均振幅
        for (let i = 0; i < sampleSize; i++) {
            sum += Math.abs(data[i]);
        }
        
        return sum / sampleSize;
    }
}

// 波形編碼器類
class WaveEncoder {
    encode({ sampleRate, channelData }) {
        const format = {
            numberOfChannels: 1,
            sampleRate: sampleRate,
            bytesPerSample: 2
        };
        
        const buffer = this.createWaveFileBuffer(format, channelData[0]);
        return buffer;
    }
    
    createWaveFileBuffer(format, samples) {
        const dataLength = samples.length * format.bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);
        
        // 寫入WAV文件頭
        this.writeWaveFileHeader(view, format, dataLength);
        
        // 寫入音頻數據
        this.writeAudioData(view, format, samples);
        
        return buffer;
    }
    
    writeWaveFileHeader(view, format, dataLength) {
        const writeString = (view, offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, format.numberOfChannels, true);
        view.setUint32(24, format.sampleRate, true);
        view.setUint32(28, format.sampleRate * format.numberOfChannels * format.bytesPerSample, true);
        view.setUint16(32, format.numberOfChannels * format.bytesPerSample, true);
        view.setUint16(34, format.bytesPerSample * 8, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);
    }
    
    writeAudioData(view, format, samples) {
        const offset = 44;
        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i]));
            const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset + i * format.bytesPerSample, value, true);
        }
    }
}

class StorageManager {
    static saveCommands(commands) {
        const serializedCommands = {};
        commands.forEach((audioBuffer, command) => {
            const channelData = audioBuffer.getChannelData(0);
            serializedCommands[command] = Array.from(channelData);
        });
        localStorage.setItem('voiceCommands', JSON.stringify(serializedCommands));
    }

    static getCommands() {
        const savedCommands = localStorage.getItem('voiceCommands');
        if (!savedCommands) return new Map();

        const commands = new Map();
        const serializedCommands = JSON.parse(savedCommands);

        Object.entries(serializedCommands).forEach(([command, channelData]) => {
            const audioBuffer = this.createAudioBuffer(channelData);
            if (audioBuffer) {
                commands.set(command, audioBuffer);
            }
        });

        return commands;
    }

    static createAudioBuffer(channelData) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = audioContext.createBuffer(1, channelData.length, audioContext.sampleRate);
            buffer.getChannelData(0).set(channelData);
            return buffer;
        } catch (error) {
            console.error('Error creating audio buffer:', error);
            return null;
        }
    }

    static saveAvatar(dataUrl) {
        localStorage.setItem('avatar', dataUrl);
    }

    static getAvatar() {
        return localStorage.getItem('avatar');
    }

    static saveTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    static getTheme() {
        return localStorage.getItem('theme');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// 導出給其他檔案使用
window.AudioProcessor = AudioProcessor;
window.StorageManager = StorageManager;
