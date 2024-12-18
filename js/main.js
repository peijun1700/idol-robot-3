document.addEventListener('DOMContentLoaded', () => {
    const audioProcessor = new AudioProcessor();
    const themeManager = new ThemeManager();
    
    // 初始化 WaveSurfer
    audioProcessor.initWaveSurfer('#waveform');

    // 載入儲存的設定
    loadSavedSettings();

    // 機器人名字相關
    const editNameBtn = document.getElementById('editNameBtn');
    const nameModal = document.getElementById('nameEditModal');
    const botNameInput = document.getElementById('botNameInput');
    const saveNameBtn = document.getElementById('saveNameBtn');
    const cancelNameBtn = document.getElementById('cancelNameBtn');

    editNameBtn.addEventListener('click', () => {
        nameModal.classList.add('show');
        botNameInput.value = document.getElementById('botName').textContent;
    });

    saveNameBtn.addEventListener('click', () => {
        const newName = botNameInput.value.trim();
        if (newName) {
            document.getElementById('botName').textContent = newName;
            localStorage.setItem('botName', newName);
            nameModal.classList.remove('show');
            showNotification('機器人名字已更新！');
        }
    });

    cancelNameBtn.addEventListener('click', () => {
        nameModal.classList.remove('show');
    });

    // 點擊模態框外部關閉
    nameModal.addEventListener('click', (e) => {
        if (e.target === nameModal) {
            nameModal.classList.remove('show');
        }
    });

    // 頭像更換功能
    const avatarContainer = document.getElementById('avatarContainer');
    const avatarInput = document.getElementById('avatarInput');
    const botAvatar = document.getElementById('botAvatar');

    avatarContainer.addEventListener('click', () => {
        avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('avatar', file);

            fetch('/upload-avatar', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    botAvatar.src = data.path;
                    showNotification('頭像更新成功！');
                    localStorage.setItem('botAvatar', data.path);
                } else {
                    showNotification(data.error || '上傳失敗，請重試', 'error');
                }
            })
            .catch(error => {
                showNotification('上傳時發生錯誤，請重試', 'error');
            });
        }
    });

    // 事件監聽器
    document.getElementById('startButton').addEventListener('click', () => {
        audioProcessor.startListening();
        animateButton('startButton');
    });

    document.getElementById('stopButton').addEventListener('click', () => {
        audioProcessor.stopListening();
        animateButton('stopButton');
    });

    document.getElementById('addCommand').addEventListener('click', handleCommandAdd);
    document.getElementById('uploadAudio').addEventListener('change', () => {
        const fileName = document.getElementById('uploadAudio').files[0]?.name;
        if (fileName) {
            document.querySelector('.upload-label').textContent = fileName;
        }
    });

    // 優化音效上傳功能
    function handleAudioUpload(file) {
        const formData = new FormData();
        formData.append('audio', file);

        return fetch('/upload-audio', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('音效上傳成功！');
                return data.path;
            } else {
                throw new Error(data.error || '上傳失敗');
            }
        });
    }

    // 指令管理
    async function handleCommandAdd() {
        const commandText = document.getElementById('commandText').value.trim();
        const audioFile = document.getElementById('uploadAudio').files[0];

        if (!commandText || !audioFile) {
            showNotification('請輸入指令並選擇音檔', 'error');
            return;
        }

        try {
            const audioPath = await handleAudioUpload(audioFile);
            await audioProcessor.handleFileUpload(audioFile, commandText, audioPath);
            showNotification('指令新增成功！');
            document.getElementById('commandText').value = '';
            document.getElementById('uploadAudio').value = '';
            document.querySelector('.upload-label').textContent = '選擇音檔';
            updateCommandList();
        } catch (error) {
            console.error('Error adding command:', error);
            showNotification('新增指令時發生錯誤', 'error');
        }
    }

    function updateCommandList() {
        const commandList = document.getElementById('commandList');
        commandList.innerHTML = '';

        if (!audioProcessor.commands || audioProcessor.commands.size === 0) {
            commandList.innerHTML = '<div class="no-commands">尚未添加任何指令</div>';
            return;
        }

        audioProcessor.commands.forEach((audioBuffer, command) => {
            const item = document.createElement('div');
            item.className = 'command-item';
            item.innerHTML = `
                <div class="command-info">
                    <div class="command-name">${command}</div>
                    <div class="audio-info">音檔大小: ${formatFileSize(audioBuffer.length * 2)}</div>
                </div>
                <div class="command-actions">
                    <button class="play-btn" title="播放">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="delete-btn" title="刪除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // 播放按鈕事件
            const playBtn = item.querySelector('.play-btn');
            let isPlaying = false;

            playBtn.addEventListener('click', async () => {
                if (isPlaying) {
                    audioProcessor.stopPlayback();
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                } else {
                    try {
                        playBtn.innerHTML = '<i class="fas fa-stop"></i>';
                        isPlaying = true;
                        await audioProcessor.playAudio(audioBuffer);
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        isPlaying = false;
                    } catch (error) {
                        console.error('Error playing audio:', error);
                        showNotification('播放音檔時發生錯誤', 'error');
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        isPlaying = false;
                    }
                }
            });

            // 刪除按鈕事件 - 長按刪除
            const deleteBtn = item.querySelector('.delete-btn');
            let deleteTimeout;
            let deleteStartTime;

            deleteBtn.addEventListener('mousedown', (e) => {
                deleteStartTime = Date.now();
                deleteTimeout = setTimeout(() => {
                    if (confirm('確定要刪除此指令嗎？')) {
                        audioProcessor.commands.delete(command);
                        StorageManager.saveCommands(audioProcessor.commands);
                        updateCommandList();
                        showNotification('指令已刪除');
                    }
                }, 1000); // 長按 1 秒後觸發
            });

            deleteBtn.addEventListener('mouseup', () => {
                if (Date.now() - deleteStartTime < 1000) {
                    clearTimeout(deleteTimeout);
                    showNotification('長按按鈕以刪除指令', 'info');
                }
            });

            deleteBtn.addEventListener('mouseleave', () => {
                clearTimeout(deleteTimeout);
            });

            commandList.appendChild(item);
        });
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function loadSavedSettings() {
        // 載入機器人名字
        const savedName = localStorage.getItem('botName');
        if (savedName) {
            document.getElementById('botName').textContent = savedName;
        }

        // 載入保存的頭像
        const savedAvatar = localStorage.getItem('botAvatar');
        if (savedAvatar) {
            botAvatar.src = savedAvatar;
        }

        // 載入儲存的指令
        const savedCommands = StorageManager.getCommands();
        if (savedCommands) {
            savedCommands.forEach((audioBuffer, command) => {
                audioProcessor.addCommand(command, audioBuffer);
            });
            updateCommandList();
        }

        // 載入其他設定...
    }

    // 主題管理
    function handleThemeChange(e) {
        const theme = e.target.value;
        themeManager.applyTheme(theme);
    }

    function handleCustomColor(e) {
        const color = e.target.value;
        themeManager.applyCustomColor(color);
    }

    // 檔案上傳處理
    function handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const avatarImg = document.querySelector('.avatar img');
            avatarImg.src = e.target.result;
            StorageManager.saveAvatar(e.target.result);
            animateAvatar();
        };
        reader.readAsDataURL(file);
    }

    function handleBackgroundUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.body.style.backgroundImage = `url(${e.target.result})`;
            StorageManager.saveBackground(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    // 動畫效果
    function animateButton(buttonId) {
        const button = document.getElementById(buttonId);
        button.classList.add('clicked');
        setTimeout(() => button.classList.remove('clicked'), 200);
    }

    function animateAvatar() {
        const avatar = document.querySelector('.avatar');
        avatar.classList.add('pulse');
        setTimeout(() => avatar.classList.remove('pulse'), 1000);
    }

    // 工具函數
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
});

// 主題管理器類別
class ThemeManager {
    constructor() {
        this.themes = {
            default: {
                primary: '#98D8AA',
                secondary: '#F5F5F5',
                text: '#333333',
                accent: '#FF9B9B',
                background: '#FFFFFF'
            },
            dark: {
                primary: '#2C3E50',
                secondary: '#34495E',
                text: '#ECF0F1',
                accent: '#3498DB',
                background: '#1A1A1A'
            },
            warm: {
                primary: '#FF9F43',
                secondary: '#FFF3E0',
                text: '#5D4037',
                accent: '#FF6B6B',
                background: '#FFF8E1'
            }
        };
    }

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;

        document.documentElement.style.setProperty('--primary-color', theme.primary);
        document.documentElement.style.setProperty('--secondary-color', theme.secondary);
        document.documentElement.style.setProperty('--text-color', theme.text);
        document.documentElement.style.setProperty('--accent-color', theme.accent);
        document.documentElement.style.setProperty('--background-color', theme.background);

        StorageManager.saveTheme(themeName);
    }

    applyCustomColor(color) {
        document.documentElement.style.setProperty('--primary-color', color);
        StorageManager.saveTheme('custom');
    }
}
