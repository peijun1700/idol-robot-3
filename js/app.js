const audioProcessor = new AudioProcessor();
const themeManager = new ThemeManager();

document.addEventListener('DOMContentLoaded', () => {
    // 初始化 WaveSurfer
    audioProcessor.initWaveSurfer('#waveform');

    // 載入儲存的設定
    loadSavedSettings();

    // 事件監聽器設置
    setupEventListeners();
});

function setupEventListeners() {
    // 語音控制按鈕
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    
    startButton.addEventListener('click', () => {
        audioProcessor.startListening();
        animateButton('startButton');
        document.querySelector('.avatar').classList.add('listening');
    });

    stopButton.addEventListener('click', () => {
        audioProcessor.stopListening();
        animateButton('stopButton');
        document.querySelector('.avatar').classList.remove('listening');
    });

    // 指令管理
    const addCommandBtn = document.getElementById('addCommand');
    const uploadAudioInput = document.getElementById('uploadAudio');
    const commandTextInput = document.getElementById('commandText');

    addCommandBtn.addEventListener('click', async () => {
        const commandText = commandTextInput.value.trim();
        const audioFile = uploadAudioInput.files[0];

        if (!commandText || !audioFile) {
            showNotification('請輸入指令並選擇音檔', 'error');
            return;
        }

        try {
            await audioProcessor.handleFileUpload(audioFile, commandText);
            showNotification('指令新增成功！');
            commandTextInput.value = '';
            uploadAudioInput.value = '';
            document.querySelector('.upload-label').textContent = '選擇音檔';
            updateCommandList();
        } catch (error) {
            console.error('Error adding command:', error);
            showNotification('新增指令時發生錯誤', 'error');
        }
    });

    uploadAudioInput.addEventListener('change', () => {
        const fileName = uploadAudioInput.files[0]?.name || '選擇音檔';
        document.querySelector('.upload-label').textContent = fileName;
    });

    // 頭像上傳處理
    const avatarContainer = document.querySelector('.avatar');
    const avatarInput = document.createElement('input');
    avatarInput.type = 'file';
    avatarInput.accept = 'image/*';
    avatarInput.style.display = 'none';
    document.body.appendChild(avatarInput);

    avatarContainer.addEventListener('click', () => {
        avatarInput.click();
    });

    avatarInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleAvatarUpload(file);
        }
    });

    // 更新指令列表
    updateCommandList();
}

async function handleAvatarUpload(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const response = await fetch('/upload-avatar', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        if (data.success) {
            const avatarImg = document.querySelector('.avatar img');
            avatarImg.src = data.path;
            showNotification('頭像更新成功！');
        }
    } catch (error) {
        console.error('Error uploading avatar:', error);
        showNotification('頭像上傳失敗', 'error');
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

        // 刪除按鈕事件
        const deleteBtn = item.querySelector('.delete-btn');
        let deleteTimeout;
        let deleteStartTime;

        deleteBtn.addEventListener('mousedown', () => {
            deleteStartTime = Date.now();
            deleteTimeout = setTimeout(() => {
                if (confirm('確定要刪除此指令嗎？')) {
                    audioProcessor.commands.delete(command);
                    StorageManager.saveCommands(audioProcessor.commands);
                    updateCommandList();
                    showNotification('指令已刪除');
                }
            }, 1000);
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

function loadSavedSettings() {
    // 載入儲存的指令
    const savedCommands = StorageManager.getCommands();
    if (savedCommands) {
        savedCommands.forEach((command) => {
            audioProcessor.commands.set(command.name, command.audio);
        });
        updateCommandList();
    }

    // 載入機器人名字
    const savedName = localStorage.getItem('botName');
    if (savedName) {
        document.getElementById('botName').textContent = savedName;
    }

    // 載入主題設定
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
        document.getElementById('themeSelector').value = savedTheme;
    }

    // 載入自訂顏色
    const savedColor = localStorage.getItem('customColor');
    if (savedColor) {
        document.documentElement.style.setProperty('--primary-color', savedColor);
        document.getElementById('customColorPicker').value = savedColor;
    }
}

// 編輯機器人名字相關功能
const editNameBtn = document.getElementById('editNameBtn');
const nameEditModal = document.getElementById('nameEditModal');
const botNameInput = document.getElementById('botNameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');

editNameBtn.addEventListener('click', () => {
    const currentName = document.getElementById('botName').textContent;
    botNameInput.value = currentName;
    nameEditModal.style.display = 'flex';
});

saveNameBtn.addEventListener('click', () => {
    const newName = botNameInput.value.trim();
    if (newName) {
        document.getElementById('botName').textContent = newName;
        localStorage.setItem('botName', newName);
        showNotification('機器人名字已更新');
    }
    nameEditModal.style.display = 'none';
});

cancelNameBtn.addEventListener('click', () => {
    nameEditModal.style.display = 'none';
});

// 主題切換相關功能
const themeSelector = document.getElementById('themeSelector');
themeSelector.addEventListener('change', (e) => {
    const selectedTheme = e.target.value;
    document.body.setAttribute('data-theme', selectedTheme);
    localStorage.setItem('theme', selectedTheme);
});

// 自訂顏色相關功能
const customColorPicker = document.getElementById('customColorPicker');
customColorPicker.addEventListener('change', (e) => {
    const selectedColor = e.target.value;
    document.documentElement.style.setProperty('--primary-color', selectedColor);
    localStorage.setItem('customColor', selectedColor);
});

// 按鈕動畫效果
function animateButton(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.add('clicked');
    setTimeout(() => {
        button.classList.remove('clicked');
    }, 200);
}

// 顯示通知
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// 格式化檔案大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}
