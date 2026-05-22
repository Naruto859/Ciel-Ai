/* CIEL AI — ui.js (Part 2) */
'use strict';
const C = window.CielAI;
const $ = id => document.getElementById(id);

// DOM refs
const sidebar          = $('sidebar');
const sidebarOverlay   = $('sidebarOverlay');
const chatHistoryList  = $('chatHistoryList');
const welcomeScreen    = $('welcomeScreen');
const welcomeTitle     = $('welcomeTitle');
const messagesContainer= $('messagesContainer');
const typingIndicator  = $('typingIndicator');
const chatInput        = $('chatInput');
const sendBtn          = $('sendBtn');
const chatTitle        = $('chatTitle');
const queueBanner      = $('queueBanner');
const countdown        = $('countdown');
const suggestedPrompts = $('suggestedPrompts');
const settingsOverlay  = $('settingsOverlay');
const shareOverlay     = $('shareOverlay');
const imagePanel       = $('imagePanel');
const headerDropdown   = $('headerDropdown');
const modelDropdown    = $('modelDropdown');
const modelSwitcherBtn = $('modelSwitcherBtn');
const currentModelLabel= $('currentModelLabel');
const memoryIndicator  = $('memoryIndicator');
const themeLabel       = $('themeLabel');
const voiceGroup       = $('voiceGroup');
const cielCore         = $('cielCoreHeader');

function setCoreActive(on) {
  if (cielCore) cielCore.classList.toggle('active', on);
}

let activeChatObj = null;
let isCoolingDown  = false;
let pendingQueue   = [];

// ── Clipboard helper (works on HTTP / mobile) ──
function copyToClipboard(text, onDone) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onDone).catch(() => fallbackCopy(text, onDone));
  } else {
    fallbackCopy(text, onDone);
  }
}
function fallbackCopy(text, onDone) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); onDone(); } catch {}
  ta.remove();
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
window.cielToast = toast; // expose for app.js TTS errors

// ── Theme ──────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  $('hljs-theme').href = isLight
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
  
  const checkbox = $('themeToggleCheckbox');
  if (checkbox) checkbox.checked = isLight; 
}

$('themeToggleCheckbox')?.addEventListener('change', (e) => {
  const next = e.target.checked ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('cielai_theme', next);
});

// ── Memory indicator ───────────────────
window.showMemoryIndicator = show => {
  memoryIndicator.style.display = show ? 'block' : 'none';
};

// ── Sidebar ────────────────────────────
function openSidebar()  { sidebar.classList.add('open');    sidebarOverlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); }

function triggerVibrate(el) {
  el.classList.remove('vibrate');
  void el.offsetWidth; // force reflow so animation restarts
  el.classList.add('vibrate');
  el.addEventListener('animationend', () => el.classList.remove('vibrate'), { once: true });
}

$('hamburgerBtn').addEventListener('click', () => {
  triggerVibrate($('hamburgerBtn'));
  openSidebar();
});
$('sidebarClose').addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// ── Settings ───────────────────────────
let initialSettingsJSON = '';

function openSettings() { 
  loadSettingsUI(); 
  initialSettingsJSON = JSON.stringify(C.state.settings);
  settingsOverlay.classList.add('show'); 
}

function handleSettingsClose() {
  const currentSettings = {
    ...C.state.settings,
    ttsVoice: $('ttsVoiceSelect').value,
    sttLang: $('sttLangSelect').value,
    apiKey: $('apiKeyInput').value.trim(),
    tavilyKey: $('tavilyKeyInput').value.trim(),
  };
  
  // Exclude models from comparison if they are saved immediately, but wait: 
  // The 'Save Settings' button actually saves everything. If user clicks a model chip, it updates C.state.settings immediately.
  // So currentSettings.textModel will match C.state.settings.textModel.
  // The actual check should be against the state BEFORE opening settings.
  
  if (JSON.stringify(currentSettings) !== initialSettingsJSON) {
    if (confirm('You have unsaved changes. Do you want to save them before closing?')) {
      $('saveSettingsBtn').click();
      return;
    } else {
      // Revert settings
      C.state.settings = JSON.parse(initialSettingsJSON);
      C.saveState();
      updateHeaderUI();
    }
  }
  closeSettings();
}

function closeSettings() { settingsOverlay.classList.remove('show'); }
$('settingsBtn').addEventListener('click', () => { closeSidebar(); openSettings(); });
$('settingsClose').addEventListener('click', handleSettingsClose);
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) handleSettingsClose(); });

function loadSettingsUI() {
  const s = C.state.settings;
  // Re-render to apply correct key permissions colors
  renderDynamicModels();
  
  document.querySelectorAll('#ttsModeChips .model-chip').forEach(b => b.classList.toggle('active', b.dataset.mode === s.ttsMode));
  const isPolly = s.ttsMode === 'pollinations';
  voiceGroup.style.display = isPolly ? 'block' : 'none';
  $('ttsVoiceSelect').value  = s.ttsVoice || 'nova';
  $('sttLangSelect').value   = s.sttLang;
  $('apiKeyInput').value     = s.apiKey;
  $('tavilyKeyInput').value  = s.tavilyKey || '';
  updateTtsWarning();
}

function updateTtsWarning() {
  const isPolly = document.querySelector('#ttsModeChips .model-chip.active')?.dataset.mode === 'pollinations';
  const hasKey  = $('apiKeyInput').value.trim().length > 4;
  let warn = $('ttsKeyWarning');
  if (!warn) {
    warn = document.createElement('p');
    warn.id = 'ttsKeyWarning';
    warn.className = 'settings-hint';
    warn.style.color = '#f59e0b';
    warn.style.fontWeight = '700';
    $('voiceGroup').appendChild(warn);
  }
  warn.style.display = (isPolly && !hasKey) ? 'block' : 'none';
  warn.textContent = 'API key required for Pollinations voice. Enter key below.';
}

document.querySelectorAll('#ttsModeChips .model-chip').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#ttsModeChips .model-chip').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  voiceGroup.style.display = b.dataset.mode === 'pollinations' ? 'block' : 'none';
  updateTtsWarning();
}));
$('apiKeyInput').addEventListener('input', () => {
  updateTtsWarning();
  const display = $('balanceDisplay');
  if (display) {
    display.textContent = '';
    display.style.display = 'none';
  }
  // Update state immediately for live UI feedback
  C.state.settings.apiKey = $('apiKeyInput').value.trim();
  renderDynamicModels();
});
$('toggleApiKey').addEventListener('click', () => {
  const inp = $('apiKeyInput');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('toggleApiKey').innerHTML = show
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
});
$('checkBalanceBtn')?.addEventListener('click', async () => {
  const apiKey = $('apiKeyInput').value.trim();
  const display = $('balanceDisplay');
  if (!apiKey) { toast('Enter an API key first to check balance', 'error'); return; }
  
  display.style.display = 'block';
  display.style.color = 'var(--dim)';
  display.textContent = 'Checking balance...';
  
  try {
    const res = await fetch('https://gen.pollinations.ai/account/balance', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error('Invalid key or network error');
    const data = await res.json();
    
    let text = [];
    if (data.balance !== undefined) {
      text.push(`Balance: ${Number(data.balance).toFixed(2)}`);
    } else {
      if (data.tierBalance > 0) text.push(`Free: ${data.tierBalance.toFixed(2)}`);
      const paid = (data.cryptoBalance || 0) + (data.packBalance || 0);
      if (paid > 0) text.push(`Paid: ${paid.toFixed(2)}`);
    }
    
    if (text.length === 0 || (data.balance !== undefined && data.balance <= 0)) {
      display.style.color = '#ef4444';
      display.textContent = 'Balance empty. Please top up.';
    } else {
      display.style.color = 'var(--accent)';
      display.textContent = text.join(' | ');
      // Immediately save the API key and re-render dynamic models
      C.state.settings.apiKey = apiKey;
      C.saveState();
      renderDynamicModels();
    }
  } catch (e) {
    display.style.color = '#ef4444';
    display.textContent = 'Error: ' + e.message;
  }
});

$('toggleTavilyKey')?.addEventListener('click', () => {
  const inp = $('tavilyKeyInput');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('toggleTavilyKey').innerHTML = show
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
});
$('saveSettingsBtn').addEventListener('click', () => {
  const ttsMode = document.querySelector('#ttsModeChips .model-chip.active')?.dataset.mode || 'browser';
  const apiKey  = $('apiKeyInput').value.trim();
  if (ttsMode === 'pollinations' && !apiKey) {
    toast('Enter your Pollinations API key to use Premium voice', 'error');
    $('apiKeyInput').focus();
    return;
  }
  C.state.settings.textModel  = document.querySelector('#textModelChips .model-chip.active')?.dataset.model  || 'openai';
  C.state.settings.imageModel = document.querySelector('#imageModelChips .model-chip.active')?.dataset.model || 'flux';
  C.state.settings.videoModel = document.querySelector('#videoModelChips .model-chip.active')?.dataset.model || 'ltx-2';
  C.state.settings.ttsMode    = ttsMode;
  C.state.settings.ttsVoice   = $('ttsVoiceSelect').value;
  C.state.settings.sttLang    = $('sttLangSelect').value;
  C.state.settings.apiKey     = apiKey;
  C.state.settings.tavilyKey  = $('tavilyKeyInput').value.trim();
  C.saveState();
  
  if (activeChatObj) { 
    activeChatObj.model = C.state.settings.textModel; 
    C.saveChat(activeChatObj); 
  }
  
  updateHeaderUI();
  closeSettings();
  toast('Settings saved', 'success');
});

// Test Voice button
$('testVoiceBtn')?.addEventListener('click', async () => {
  const apiKey = $('apiKeyInput').value.trim();
  const voice  = $('ttsVoiceSelect').value;
  if (!apiKey) { toast('Enter API key first', 'error'); return; }
  const btn = $('testVoiceBtn');
  btn.disabled = true; btn.textContent = 'Testing…';
  try {
    const url = await C.callPollinationsAudio('Hello, I am Ciel, your AI assistant.', voice, apiKey);
    new Audio(url).play();
    toast('Voice works!', 'success');
  } catch (e) {
    toast(e.message || 'Voice test failed', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Test Voice';
  }
});

// ── Model Switcher (mid-chat) ──────────
modelSwitcherBtn.addEventListener('click', e => {
  e.stopPropagation();
  const vis = modelDropdown.style.display === 'block';
  modelDropdown.style.display = vis ? 'none' : 'block';
});
document.addEventListener('click', () => { modelDropdown.style.display = 'none'; });

function getModelLabel(modelId) {
  const m = C.state.textModels.find(x => x.name === modelId);
  return m ? m.name : modelId;
}

function updateHeaderUI() {
  const model = (activeChatObj?.model) || C.state.settings.textModel;
  currentModelLabel.textContent = getModelLabel(model) || 'GPT-4o';
}

function renderDynamicModels() {
  const textContainer = $('textModelChips');
  const imgContainer = $('imageModelChips');
  const vidContainer = $('videoModelChips');
  const dropdown = $('modelDropdown');
  const hasKey = C.state.settings.apiKey?.trim().length > 4;

  if (textContainer) textContainer.innerHTML = '';
  if (imgContainer) imgContainer.innerHTML = '';
  if (vidContainer) vidContainer.innerHTML = '';
  if (dropdown) dropdown.innerHTML = '';

  C.state.textModels.forEach(m => {
    const isFree = m.name === 'openai' || m.name === 'openai-fast';
    const requiresKey = !isFree;

    // Dropdown
    const ddBtn = document.createElement('button');
    ddBtn.className = 'model-dd-item';
    ddBtn.dataset.model = m.name;
    ddBtn.textContent = m.name + (isFree ? ' (Free)' : '');
    if (requiresKey && !hasKey) ddBtn.style.color = '#ff4444';
    
    ddBtn.addEventListener('click', () => {
      if (requiresKey && !hasKey) {
        toast('Please provide an API key in Settings to use this model.', 'error');
        return;
      }
      C.state.settings.textModel = m.name;
      if (activeChatObj) { activeChatObj.model = m.name; C.saveChat(activeChatObj); }
      updateHeaderUI();
      // keep settings in sync
      document.querySelectorAll('#textModelChips .model-chip').forEach(x => x.classList.toggle('active', x.dataset.model === m.name));
      toast(`Switched to ${m.name}`, 'success');
      modelDropdown.style.display = 'none';
    });
    if (dropdown) dropdown.appendChild(ddBtn);

    // Settings Chip
    const chip = document.createElement('button');
    chip.className = 'model-chip' + (C.state.settings.textModel === m.name ? ' active' : '');
    chip.dataset.model = m.name;
    chip.innerHTML = m.name + (isFree ? ' <span style="font-size:0.7em;color:var(--accent)">Free</span>' : '');
    if (requiresKey && !hasKey) chip.style.border = '1px solid #ff4444';
    
    chip.addEventListener('click', () => {
      if (requiresKey && !hasKey) {
        toast('Please provide an API key in Settings to use this model.', 'error');
        return;
      }
      document.querySelectorAll('#textModelChips .model-chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      C.state.settings.textModel = m.name;
    });
    if (textContainer) textContainer.appendChild(chip);
  });

  // Sort image models so 'flux' is always at the top
  const sortedImageModels = [...C.state.imageModels].sort((a, b) => {
    if (a.name === 'flux') return -1;
    if (b.name === 'flux') return 1;
    return 0;
  });

  sortedImageModels.forEach(m => {
    const isFree = m.name === 'flux';
    const requiresKey = !isFree;

    const chip = document.createElement('button');
    chip.className = 'model-chip' + (C.state.settings.imageModel === m.name ? ' active' : '');
    chip.dataset.model = m.name;
    chip.innerHTML = m.name + (isFree ? ' <span style="font-size:0.7em;color:var(--accent)">Free</span>' : '');
    if (requiresKey && !hasKey) chip.style.border = '1px solid #ff4444';
    
    chip.addEventListener('click', () => {
      if (requiresKey && !hasKey) {
        toast('Please provide an API key in Settings to use this model.', 'error');
        return;
      }
      document.querySelectorAll('#imageModelChips .model-chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      C.state.settings.imageModel = m.name;
    });
    if (imgContainer) imgContainer.appendChild(chip);
  });

  C.state.videoModels.forEach(m => {
    const requiresKey = true; // All video models require key

    const chip = document.createElement('button');
    chip.className = 'model-chip' + (C.state.settings.videoModel === m.name ? ' active' : '');
    chip.dataset.model = m.name;
    chip.textContent = m.name;
    if (requiresKey && !hasKey) chip.style.border = '1px solid #ff4444';
    
    chip.addEventListener('click', () => {
      if (requiresKey && !hasKey) {
        toast('Please provide an API key in Settings to use this model.', 'error');
        return;
      }
      document.querySelectorAll('#videoModelChips .model-chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      C.state.settings.videoModel = m.name;
    });
    if (vidContainer) vidContainer.appendChild(chip);
  });
}

// ── Header dropdown ────────────────────
$('menuBtn').addEventListener('click', e => { e.stopPropagation(); headerDropdown.classList.toggle('show'); });
document.addEventListener('click', () => headerDropdown.classList.remove('show'));
$('renameChatBtn').addEventListener('click', () => {
  if (!activeChatObj) return;
  const name = prompt('Rename chat:', activeChatObj.title);
  if (name?.trim()) {
    activeChatObj.title = name.trim();
    C.saveChat(activeChatObj);
    chatTitle.textContent = activeChatObj.title;
    renderChatHistory();
  }
});
$('clearChatBtn').addEventListener('click', () => {
  if (!activeChatObj || !confirm('Clear all messages?')) return;
  activeChatObj.messages = [];
  C.saveChat(activeChatObj);
  showWelcome();
  renderChatHistory();
  toast('Messages cleared');
});
$('exportChatBtn').addEventListener('click', () => {
  if (!activeChatObj) return;
  const text = activeChatObj.messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], {type:'text/plain'})), download: activeChatObj.title + '.txt' });
  a.click();
});
$('deleteChatBtn').addEventListener('click', () => {
  if (!activeChatObj || !confirm('Delete this chat permanently?')) return;
  C.deleteChat(activeChatObj.id);
  startNewChat();
  toast('Chat deleted');
});

// ── Rename Popup ───────────────────────
function openRenamePopup() {
  if (!activeChatObj) return;
  $('renameChatInput').value = activeChatObj.title === 'New Chat' ? '' : activeChatObj.title;
  $('renameOverlay').classList.add('show');
  setTimeout(() => $('renameChatInput').focus(), 80);
}
function closeRenamePopup() {
  $('renameOverlay').classList.remove('show');
}
function confirmRename() {
  const name = $('renameChatInput').value.trim();
  if (!name) { toast('Please enter a name', 'error'); return; }
  activeChatObj.title = name;
  C.saveChat(activeChatObj);
  chatTitle.textContent = name;
  renderChatHistory();
  closeRenamePopup();
  toast('Renamed');
}
$('renameTitleBtn').addEventListener('click', openRenamePopup);
$('renameChatBtn').addEventListener('click', () => { headerDropdown.classList.remove('show'); openRenamePopup(); });
$('renameClose').addEventListener('click', closeRenamePopup);
$('renameCancelBtn').addEventListener('click', closeRenamePopup);
$('renameConfirmBtn').addEventListener('click', confirmRename);
$('renameChatInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') closeRenamePopup(); });
$('renameOverlay').addEventListener('click', e => { if (e.target === $('renameOverlay')) closeRenamePopup(); });

// ── Share ──────────────────────────────
$('shareBtn').addEventListener('click', () => {
  if (!activeChatObj) { toast('Start a chat first', 'error'); return; }
  $('shareLinkInput').value = C.buildShareURL(activeChatObj);
  shareOverlay.classList.add('show');
});
$('shareClose').addEventListener('click', () => shareOverlay.classList.remove('show'));
shareOverlay.addEventListener('click', e => { if (e.target === shareOverlay) shareOverlay.classList.remove('show'); });
$('copyLinkBtn').addEventListener('click', () => {
  navigator.clipboard.writeText($('shareLinkInput').value).then(() => toast('Link copied!', 'success'));
});

// ── File Attachment ─────────────────────
let attachedFileContent = null;
let attachedFileName    = null;
let attachedFileType    = null;

const attachBtn      = $('attachBtn');
const fileInput      = $('fileInput');
const attachPreview  = $('attachPreview');
const attachFileName = $('attachFileName');
const removeAttach   = $('removeAttachBtn');

function clearAttachment() {
  attachedFileContent = null;
  attachedFileName    = null;
  attachedFileType    = null;
  attachPreview.style.display = 'none';
  fileInput.value = '';
  attachBtn.classList.remove('active');
}

attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  
  if (isImage) {
    if (file.size > 4 * 1024 * 1024) { toast('Image too large (max 4MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      attachedFileContent = e.target.result;
      attachedFileName = file.name;
      attachedFileType = 'image';
      attachFileName.textContent = file.name;
      attachPreview.style.display = 'block';
      attachBtn.classList.add('active');
      toast(`Attached image: ${file.name}`, 'success');
    };
    reader.onerror = () => toast('Could not read image', 'error');
    reader.readAsDataURL(file);
  } else {
    if (file.size > 512000) { toast('File too large (max 500 KB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      attachedFileContent = e.target.result;
      attachedFileName    = file.name;
      attachedFileType    = 'text';
      attachFileName.textContent = file.name;
      attachPreview.style.display = 'block';
      attachBtn.classList.add('active');
      toast(`Attached: ${file.name}`, 'success');
    };
    reader.onerror = () => toast('Could not read file', 'error');
    reader.readAsText(file);
  }
});

removeAttach.addEventListener('click', () => { clearAttachment(); toast('Attachment removed'); });

// ── Image Panel ────────────────────────
$('imageToggleBtn').addEventListener('click', () => {
  const open = imagePanel.style.display === 'block';
  imagePanel.style.display = open ? 'none' : 'block';
  $('imageToggleBtn').classList.toggle('active', !open);
});
$('imagePanelClose').addEventListener('click', () => {
  imagePanel.style.display = 'none';
  $('imageToggleBtn').classList.remove('active');
});
$('generateImgBtn').addEventListener('click', async () => {
  const prompt = $('imagePromptInput').value.trim();
  if (!prompt) return;
  imagePanel.style.display = 'none';
  $('imageToggleBtn').classList.remove('active');
  appendUserMessage('[Image Request] ' + prompt);
  appendAIMessage(`Generating your image…\n\nIMAGE: ${prompt}`);
});

// ── Suggested Prompts ──────────────────
function renderSuggestedPrompts() {
  const shuffled = [...C.ALL_PROMPTS].sort(() => Math.random() - .5).slice(0, 6);
  suggestedPrompts.innerHTML = '';
  shuffled.forEach(([label, prompt]) => {
    const btn = document.createElement('button');
    btn.className = 'prompt-chip';
    btn.textContent = label;
    btn.addEventListener('click', () => handleSend(prompt));
    suggestedPrompts.appendChild(btn);
  });
}
$('refreshPrompts').addEventListener('click', renderSuggestedPrompts);

// ── Chat History ───────────────────────
function renderChatHistory() {
  const sorted = Object.values(C.getAllChats()).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  chatHistoryList.innerHTML = '';
  if (!sorted.length) {
    chatHistoryList.innerHTML = '<p style="text-align:center;color:var(--dim);font-size:.8rem;padding:20px 0">No conversations yet</p>';
    return;
  }
  sorted.forEach(chat => {
    const el = document.createElement('div');
    el.className = 'history-item' + (chat.id === activeChatObj?.id ? ' active' : '');
    el.innerHTML = `<span class="history-item-title">${chat.title}</span><button class="history-item-del" data-id="${chat.id}">✕</button>`;
    el.addEventListener('click', e => {
  if (e.target.classList.contains('history-item-del')) {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
      C.deleteChat(chat.id);
      if (chat.id === activeChatObj?.id) {
        startNewChat();
        renderChatHistory();
      } else {
        renderChatHistory();
      }
    }
    return;
  }
  loadChat(chat.id);
  closeSidebar();
});
    chatHistoryList.appendChild(el);
  });
}

// ── Load / New Chat ────────────────────
function loadChat(id) {
  const chat = C.getChat(id);
  if (!chat) return;
  activeChatObj = chat;
  C.state.settings.textModel = chat.model || C.state.settings.textModel;
  C.setChatIdInURL(id);
  chatTitle.textContent = chat.title;
  updateHeaderUI();
  renderMessages();
  renderChatHistory();
}
function startNewChat() {
  activeChatObj = C.createChat();
  C.setChatIdInURL(activeChatObj.id);
  chatTitle.textContent = 'Ciel AI';
  updateHeaderUI();
  showWelcome();
  welcomeTitle.textContent = C.greet();
  renderSuggestedPrompts();
  renderChatHistory();
}
$('newChatBtn').addEventListener('click', () => { startNewChat(); closeSidebar(); });

// ── Welcome / Hide ─────────────────────
function showWelcome() {
  welcomeScreen.style.display   = 'flex';
  messagesContainer.style.display = 'none';
  typingIndicator.style.display = 'none';
  messagesContainer.innerHTML   = '';
}
function hideWelcome() {
  welcomeScreen.style.display     = 'none';
  messagesContainer.style.display = 'flex';
}

// ── Render messages ────────────────────
function renderMessages() {
  if (!activeChatObj) { showWelcome(); return; }
  // Filter out system messages and any old auto-injected greeting bubbles
  const visible = activeChatObj.messages.filter(m =>
    m.role !== 'system' &&
    !(m.role === 'assistant' && m.content && m.content.startsWith('Hello! I am **Ciel'))
  );
  if (visible.length === 0) { showWelcome(); return; }
  hideWelcome();
  messagesContainer.innerHTML = '';
  visible.forEach(m => {
    if (m.role === 'user') appendBubble('user', m.content, m.timestamp, m.id);
    else appendBubble('ai', m.content, m.timestamp, m.id);
  });
  scrollBottom();
}


function scrollBottom() {
  const cw = $('chatWindow');
  if (cw) cw.scrollTop = cw.scrollHeight;
}

// ── Append Bubble ──────────────────────
function appendBubble(role, content, timestamp, msgId) {
  hideWelcome();
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  if (msgId) row.dataset.msgId = msgId;

  const avatar = role === 'ai' ? `<div class="msg-avatar"></div>` : '';
  const parsed  = parseMessageContent(content);
  const time    = timestamp ? `<div class="msg-time">${C.timeStr(timestamp)}</div>` : '';
  const actions = role === 'ai'
    ? `<div class="msg-actions"><button class="msg-action-btn tts-btn" title="Read aloud"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak</button><button class="msg-action-btn copy-msg-btn" title="Copy"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button></div>`
    : `<div class="msg-actions"><button class="msg-action-btn copy-msg-btn" title="Copy"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button></div>`;

  row.innerHTML = `${avatar}<div><div class="message-bubble">${parsed}</div>${time}${actions}</div>`;

  const ttsBtn = row.querySelector('.tts-btn');
  if (ttsBtn) {
    // SVG constants
    const SVG_SPEAK  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    const SVG_STOP   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/></svg>`;
    const WAVE_BARS  = `<span class="wave-bars"><span></span><span></span><span></span><span></span><span></span></span>`;

    function setTtsIdle()       { ttsBtn.className = 'msg-action-btn tts-btn'; ttsBtn.innerHTML = `${SVG_SPEAK} Speak`; }
    function setTtsGenerating() { ttsBtn.className = 'msg-action-btn tts-btn tts-generating'; ttsBtn.innerHTML = `${SVG_SPEAK} Generating…`; }
    function setTtsPlaying()    { ttsBtn.className = 'msg-action-btn tts-btn tts-playing'; ttsBtn.innerHTML = `${WAVE_BARS} Stop`; }

    let currentAudio = null;

    ttsBtn.addEventListener('click', async () => {
      // If already playing — stop
      if (ttsBtn.classList.contains('tts-playing')) {
        currentAudio?.pause();
        currentAudio = null;
        C.state.currentAudio?.pause();
        window.speechSynthesis?.cancel();
        setTtsIdle();
        return;
      }
      // If generating — ignore
      if (ttsBtn.classList.contains('tts-generating')) return;

      // ── Start generating ──
      setTtsGenerating();

      if (C.state.settings.ttsMode === 'pollinations' && C.state.settings.apiKey) {
        try {
          const url = await C.callPollinationsAudio(content, C.state.settings.ttsVoice, C.state.settings.apiKey);
          currentAudio = new Audio(url);
          C.state.currentAudio = currentAudio;
          setTtsPlaying();
          currentAudio.play();
          currentAudio.onended = () => setTtsIdle();
          currentAudio.onerror = () => { toast('Playback error', 'error'); setTtsIdle(); };
        } catch (e) {
          toast(e.message || 'Voice failed', 'error');
          setTtsIdle();
        }
      } else {
        // Browser TTS
        window.speechSynthesis?.cancel();
        const utt = new SpeechSynthesisUtterance(C.stripForTTS(content));
        utt.lang  = C.state.settings.sttLang;
        utt.rate  = 1.0;
        utt.onstart = () => setTtsPlaying();
        utt.onend   = () => setTtsIdle();
        utt.onerror = () => { toast('Voice unavailable', 'error'); setTtsIdle(); };
        window.speechSynthesis.speak(utt);
      }
    });
  }
  row.querySelector('.copy-msg-btn')?.addEventListener('click', () => {
    copyToClipboard(content, () => toast('Copied!', 'success'));
  });
  row.querySelectorAll('.copy-code-btn').forEach(btn => btn.addEventListener('click', () => {
    const code = btn.closest('.code-block-wrapper')?.querySelector('code');
    if (code) copyToClipboard(code.textContent, () => {
      btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      setTimeout(() => { btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy'; }, 2000);
    });
  }));

  messagesContainer.appendChild(row);
  hljs.highlightAll();
  scrollBottom();
  return row;
}

// ── Parse content ──────────────────────
function parseMessageContent(content) {
  const imageMatches = [...content.matchAll(/IMAGE:\s*(.+)/gi)];
  const videoMatches = [...content.matchAll(/VIDEO:\s*(.+)/gi)];
  let text = content.replace(/IMAGE:\s*.+/gi, '').replace(/VIDEO:\s*.+/gi, '').trim();
  let html = '';
  if (text) {
    html = marked.parse(text, { breaks: true })
      .replace(/<pre><code class="(language-\w+)">([\s\S]*?)<\/code><\/pre>/g, (_, cls, code) => {
        const lang = cls.replace('language-', '');
        return `<div class="code-artifact" onclick="openCodeModal(this.dataset.code, '${lang}')" data-code="${encodeURIComponent(code)}"><div class="code-artifact-left"><div class="code-artifact-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div><div class="code-artifact-info"><div class="code-artifact-title">Code Snippet</div><div class="code-artifact-lang">${lang}</div></div></div><div class="code-artifact-right">View <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div></div>`;
      })
      .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) =>
        `<div class="code-artifact" onclick="openCodeModal(this.dataset.code, 'text')" data-code="${encodeURIComponent(code)}"><div class="code-artifact-left"><div class="code-artifact-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div><div class="code-artifact-info"><div class="code-artifact-title">Code Snippet</div><div class="code-artifact-lang">TEXT</div></div></div><div class="code-artifact-right">View <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div></div>`);
  }
  imageMatches.forEach(m => {
    const prompt = m[1].trim();
    const url = C.buildImageUrl(prompt, C.state.settings.imageModel);
    html += `<div class="img-bubble"><img src="${url}" alt="${prompt}" loading="lazy" onerror="this.parentElement.innerHTML='<p style=padding:10px>⚠️ Image failed to load</p>'"/><div class="img-bubble-caption"><span>🎨 ${prompt.slice(0,60)}</span><button class="media-download-btn" onclick="window.open('${url}', '_blank')" title="Open Image"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div></div>`;
  });
  videoMatches.forEach(m => {
    const prompt = m[1].trim();
    const url = C.buildVideoUrl(prompt, C.state.settings.videoModel);
    html += `<div class="img-bubble"><video src="${url}" controls preload="metadata" style="max-width:100%;border-radius:var(--r);"></video><div class="img-bubble-caption"><span>🎬 ${prompt.slice(0,60)}</span><button class="media-download-btn" onclick="window.open('${url}', '_blank')" title="Open Video"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div></div>`;
  });
  return html || `<p>${content}</p>`;
}

// ── Append user/AI message ─────────────────
// displayText = what shows in bubble, fullText = what goes into chat history/AI context
function appendUserMessage(displayText, fullText, imageBase64) {
  if (!activeChatObj) return;
  const content = fullText || displayText;
  const msg = { id: C.uid(), role: 'user', content, displayContent: displayText, timestamp: C.now() };
  if (imageBase64) msg.image = imageBase64;
  activeChatObj.messages.push(msg);
  if (activeChatObj.messages.filter(m => m.role === 'user').length === 1) {
    activeChatObj.title = (content.replace(/<[^>]+>/g, '')).slice(0, 42) + (content.length > 42 ? '…' : '');
    chatTitle.textContent = activeChatObj.title;
    renderChatHistory();
  }
  activeChatObj.updatedAt = C.now();
  C.saveChat(activeChatObj);
  appendBubble('user', displayText, msg.timestamp, msg.id);
}
function appendAIMessage(text) {
  if (!activeChatObj) return;
  const msg = { id: C.uid(), role: 'assistant', content: text, timestamp: C.now() };
  activeChatObj.messages.push(msg);
  activeChatObj.updatedAt = C.now();
  C.saveChat(activeChatObj);
  appendBubble('ai', text, msg.timestamp, msg.id);
}

// ── Send Handler ─────────────────────
async function handleSend(text) {
  text = (text || chatInput.value).trim();
  if (!text || C.state.isGenerating) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;

  // Bundle attached file content into message if present
  let fullText = text;
  let displayText = text;
  let imageBase64 = null;

  if (attachedFileContent) {
    const fname = attachedFileName;
    if (attachedFileType === 'text') {
      const ext   = fname.split('.').pop().toLowerCase();
      const lang  = { js:'javascript', ts:'typescript', py:'python', html:'html', css:'css',
                      json:'json', md:'markdown', sh:'bash', java:'java', c:'c', cpp:'cpp',
                      kt:'kotlin', rs:'rust', swift:'swift' }[ext] || '';
      fullText = `${text}\n\n---\n**Attached file: ${fname}**\n\`\`\`${lang}\n${attachedFileContent.slice(0, 20000)}\n\`\`\``;
      displayText = text ? `${text} \ud83d\udcce *${fname}*` : `\ud83d\udcce *${fname}*`;
    } else if (attachedFileType === 'image') {
      imageBase64 = attachedFileContent;
      displayText = text ? `${text} \n<br><img src="${imageBase64}" style="max-width:200px;border-radius:8px;margin-top:8px">` : `<img src="${imageBase64}" style="max-width:200px;border-radius:8px;margin-top:8px">`;
    }
    clearAttachment();
  }

  if (isCoolingDown && (!C.state.settings.apiKey || C.state.settings.apiKey.trim().length <= 4)) {
    const row = appendBubble('user', displayText, C.now(), C.uid());
    const badge = document.createElement('div');
    badge.className = 'pending-badge';
    badge.id = 'pb-' + Date.now();
    badge.textContent = 'Queued — sends when cooldown ends';
    row.querySelector('.message-bubble').appendChild(badge);
    pendingQueue.push({ text: fullText, displayText, badgeId: badge.id, image: imageBase64 });
    return;
  }

  appendUserMessage(displayText, fullText, imageBase64);
  await doAIRequest(fullText, false, false, imageBase64);
}

async function doAIRequest(text, isRetry = false, isAgenticLoop = false, imageBase64 = null) {
  if (!isAgenticLoop) {
    C.state.isGenerating = true;
    sendBtn.disabled = true;
    typingIndicator.style.display = 'flex';
    setCoreActive(true);
    if (!isRetry) scrollBottom();
    if (!isRetry) C.extractAndUpdateUserProfile(activeChatObj, text).catch(() => {});
  }

  try {
    activeChatObj = await C.maybeCompressMemory(activeChatObj);

    // ── Vision Check ──
    const hasImageInRequest = activeChatObj.messages.some(m => m.image);
    if (hasImageInRequest) {
       const mData = C.state.textModels.find(x => x.name === C.state.settings.textModel);
       const canVision = mData && mData.input_modalities && mData.input_modalities.includes('image');
       if (!canVision) {
           typingIndicator.style.display = 'none';
           setCoreActive(false);
           C.state.isGenerating = false;
           appendAIMessage("⚠️ Error: The currently selected model does not support image analysis. Please choose a vision-capable model (like GPT-4o, Gemini, Claude, etc.) and try again.");
           if (!C.state.settings.apiKey?.trim() || C.state.settings.apiKey.trim().length <= 4) doStartCooldown();
           return;
       }
    }

    // ── Image intent ──
    if (C.detectImageIntent(text)) {
      let imagePrompt = text
        .replace(/^(please\s+)?(generate|create|make|draw|paint|show|design|render|produce)\s+(me\s+)?(an?\s+)?(image|photo|picture|pic|art|illustration|painting|wallpaper|poster)?\s*(of\s+)?/i, '')
        .replace(/\s*(image|photo|picture|banao|bana do|kar do|karo)\s*$/i, '')
        .trim();
      if (!imagePrompt || imagePrompt.length < 3) imagePrompt = text;
      typingIndicator.style.display = 'none';
      setCoreActive(false);
      C.state.isGenerating = false;
      appendAIMessage(`Sure! Generating your image now.\n\nIMAGE: ${imagePrompt}`);
      if (!C.state.settings.apiKey?.trim() || C.state.settings.apiKey.trim().length <= 4) doStartCooldown();
      return;
    }

    // ── Video intent ──
    if (C.detectVideoIntent(text)) {
      let videoPrompt = text
        .replace(/^(please\s+)?(generate|create|make|render)\s+(me\s+)?(a\s+)?(video|animation|clip)?\s*(of\s+)?/i, '')
        .replace(/\s*(video|vid|animation|banao|bana do|kar do|karo)\s*$/i, '')
        .trim();
      if (!videoPrompt || videoPrompt.length < 3) videoPrompt = text;
      typingIndicator.style.display = 'none';
      setCoreActive(false);
      C.state.isGenerating = false;
      appendAIMessage(`Sure! Generating your video now.\n\nVIDEO: ${videoPrompt}`);
      if (!C.state.settings.apiKey?.trim() || C.state.settings.apiKey.trim().length <= 4) doStartCooldown();
      return;
    }

    // ── Web Search (if Tavily key set and intent detected) ──
    let extraContext = '';
    const tavilyKey = C.state.settings.tavilyKey;
    if (tavilyKey && C.detectWebSearchIntent(text)) {
      try {
        typingIndicator.querySelector('.typing-text') &&
          (typingIndicator.querySelector('.typing-text').textContent = 'Searching the web…');
        const searchCtx = await C.callTavilySearch(text, tavilyKey);
        extraContext = '\n\n' + searchCtx;
        // Reset indicator text
        const tt = typingIndicator.querySelector('.typing-text');
        if (tt) tt.textContent = '';
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    // ── Normal text ──
    const history = activeChatObj.messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    const baseContext = C.buildContext(activeChatObj);
    const reply = await C.callTextAPI(history, C.state.settings.textModel, baseContext + extraContext);
    
    // ── Agentic VFS Actions Check ──
    const agentActions = C.processAgenticResponse(reply);
    
    if (agentActions.length > 0) {
      appendAIMessage(reply); // show the AI's action
      
      const sysMsg = agentActions.join('\n\n');
      appendUserMessage("*(System generated feedback...)*", sysMsg);
      
      const isFree = C.state.settings.textModel === 'openai' || C.state.settings.textModel === 'openai-fast';
      const hasKey = C.state.settings.apiKey?.trim().length > 4;
      
      if (isFree && !hasKey) {
         typingIndicator.style.display = 'flex';
         const tt = typingIndicator.querySelector('.typing-text');
         if (tt) tt.textContent = 'Agent is testing code (waiting for cooldown)...';
         setCoreActive(true);
         
         doStartCooldown(() => {
             const tt2 = typingIndicator.querySelector('.typing-text');
             if (tt2) tt2.textContent = '';
             doAIRequest(sysMsg, false, true);
         });
      } else {
         typingIndicator.style.display = 'flex';
         const tt = typingIndicator.querySelector('.typing-text');
         if (tt) tt.textContent = 'Agent is executing code...';
         setCoreActive(true);
         doAIRequest(sysMsg, false, true);
      }
      return;
    }

    // ── Normal Completion ──
    typingIndicator.style.display = 'none';
    const tt = typingIndicator.querySelector('.typing-text');
    if (tt) tt.textContent = '';
    setCoreActive(false);
    C.state.isGenerating = false;
    appendAIMessage(reply);
    if (!C.state.settings.apiKey?.trim() || C.state.settings.apiKey.trim().length <= 4) doStartCooldown();

  } catch (err) {
    console.warn('[Ciel] API attempt failed:', err);

    typingIndicator.style.display = 'none';
    setCoreActive(false);
    C.state.isGenerating = false;

    const msgId = C.uid();
    activeChatObj.messages.push({ id: msgId, role: 'assistant', content: '__retry__', timestamp: C.now() });
    C.saveChat(activeChatObj);

    const row = document.createElement('div');
    row.className = 'message-row ai';
    row.dataset.msgId = msgId;
    row.innerHTML = `<div class="msg-avatar"></div><div><div class="message-bubble" style="display:flex;align-items:center;gap:10px;color:var(--dim);font-size:.88rem;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${err.message || 'Something went wrong.'}
      <button class="msg-action-btn" id="retryBtn_${msgId}" style="color:var(--accent);font-weight:700">Try again</button>
    </div></div>`;
    messagesContainer.appendChild(row);
    scrollBottom();

    row.querySelector(`#retryBtn_${msgId}`)?.addEventListener('click', () => {
      row.remove();
      activeChatObj.messages = activeChatObj.messages.filter(m => m.id !== msgId);
      C.saveChat(activeChatObj);
      doAIRequest(text);
    });

    if (!C.state.settings.apiKey?.trim() || C.state.settings.apiKey.trim().length <= 4) doStartCooldown();
  }
}


function doStartCooldown(overrideCallback) {
  if (C.state.cooldownTimer) return;
  isCoolingDown = true;
  queueBanner.style.display = 'block';
  countdown.textContent = String(C.COOLDOWN_MS / 1000);
  C.startCooldown(
    rem => { countdown.textContent = String(rem); },
    async () => {
      isCoolingDown = false;
      queueBanner.style.display = 'none';
      sendBtn.disabled = chatInput.value.trim() === '';
      
      if (overrideCallback) {
        overrideCallback();
        return;
      }
      
      if (pendingQueue.length > 0) {
        const next = pendingQueue.shift();
        document.getElementById(next.badgeId)?.remove();
        appendUserMessage(next.displayText, next.text);
        await doAIRequest(next.text);
      }
    }
  );
}

// ── Input auto-resize ──────────────────
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = chatInput.value.trim() === '';
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) handleSend(); }
});
sendBtn.addEventListener('click', () => handleSend());

// ── Mic (STT) ──────────────────────────
const micBtn = $('micBtn');
let recognition = null;
micBtn.addEventListener('click', () => {
  if (C.state.isRecording) { recognition?.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice input not supported in this browser', 'error'); return; }
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = C.state.settings.sttLang;
  recognition.onstart  = () => { C.state.isRecording = true;  micBtn.classList.add('recording'); };
  recognition.onresult = e => {
    chatInput.value = [...e.results].map(r => r[0].transcript).join('');
    chatInput.dispatchEvent(new Event('input'));
  };
  recognition.onerror = recognition.onend = () => { C.state.isRecording = false; micBtn.classList.remove('recording'); };
  recognition.start();
});

// ── Code Modal ─────────────────────────
const codeModalOverlay = $('codeModalOverlay');
const codeModalContent = $('codeModalContent');
const codeModalLang = $('codeModalLang');
let currentCodeToCopy = '';

window.openCodeModal = function(encodedCode, lang) {
  const code = decodeURIComponent(encodedCode);
  currentCodeToCopy = code;
  codeModalLang.textContent = lang || 'text';
  
  // Reset classes and set new language class
  codeModalContent.className = 'hljs'; 
  if (lang) codeModalContent.classList.add('language-' + lang);
  
  // Set text and highlight
  codeModalContent.textContent = code;
  hljs.highlightElement(codeModalContent);
  
  codeModalOverlay.classList.add('show');
}

$('closeCodeModalBtn')?.addEventListener('click', () => {
  codeModalOverlay.classList.remove('show');
});

codeModalOverlay?.addEventListener('click', e => {
  if (e.target === codeModalOverlay) codeModalOverlay.classList.remove('show');
});

$('copyCodeModalBtn')?.addEventListener('click', () => {
  copyToClipboard(currentCodeToCopy, () => {
    const btn = $('copyCodeModalBtn');
    const old = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied';
    setTimeout(() => { btn.innerHTML = old; }, 2000);
    toast('Code copied!', 'success');
  });
});

// ── Boot ── always show welcome home screen on fresh open
async function boot() {
  C.loadState();
  await C.fetchModels();
  renderDynamicModels();
  applyTheme(localStorage.getItem('cielai_theme') || 'light');
  updateHeaderUI();

  const shared = C.loadFromShareHash();
  if (shared) {
    const chat = C.createChat();
    Object.assign(chat, { title: shared.title || 'Shared Chat', messages: shared.messages || [], memoryMd: shared.memoryMd || chat.memoryMd, userMd: shared.userMd || chat.userMd });
    C.saveChat(chat);
    window.location.hash = '';
    loadChat(chat.id);
    toast('Shared chat loaded!', 'success');
    return;
  }

  // If a specific chat is in the URL, load it
  const urlId = C.getChatIdFromURL();
  if (urlId && C.getChat(urlId)) { loadChat(urlId); return; }

  // Otherwise always show the welcome home screen — do NOT auto-load last chat
  startNewChat();
}

boot();
