/* ═══════════════════════════════════════
   CIEL AI — app.js  (Part 1 of 2)
   Core: State, Chat Manager, Memory, API
   ═══════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────
const COOLDOWN_MS = 16000; // 16 seconds (safe buffer above API's 15s window)
const MAX_CONTEXT_CHARS = 24000;
const POLLINATIONS_TEXT  = 'https://text.pollinations.ai/';
const POLLINATIONS_IMAGE = 'https://image.pollinations.ai/prompt/';
const POLLINATIONS_AUDIO = 'https://gen.pollinations.ai/audio/';
const TAVILY_SEARCH      = 'https://api.tavily.com/search';

const SYSTEM_MD = `
# CIEL AI — Core Persona
You are Ciel, a hyper-intelligent, efficient, and devoted AI assistant.

## Behavior:
1. On the VERY FIRST message of a new conversation, greet the user warmly, introduce yourself as Ciel, and ask their name and response style preference (short/detailed/friendly/professional) — then answer their question.
2. On subsequent messages, answer directly without re-introducing yourself.
3. Efficiency: Provide concise, high-value answers.
4. Use clear markdown formatting.
5. For image generation requests: output "IMAGE: {vivid prompt}" on its own line.
6. Do NOT mention your underlying model name (e.g. GPT-4) unless specifically asked.
7. You have a **Web Search tool**. When the user asks for real-time info, current events, latest news, today's prices, live scores, or anything that requires up-to-date data — the system will automatically inject fresh web search results into the context before your reply. Use that data to answer accurately and cite sources with markdown links.
`;

const MEMORY_COMPRESS_PROMPT = `
Reason through the following conversation history. 
Summarize it into a concise, factual brief.
RETAIN: User name, stated preferences, core topics, and key conclusions.
DISCARD: Greetings, repetition, and fluff.
Format: Bullet points.
`;

const MEMORY_BOOTSTRAP = `# Memory
- AI Name: Ciel 💠
- Powered by: Pollinations.ai
- Session started: {{DATE}}
- User name: Not yet known
- User language preference: Not set
- Topics discussed: None yet
- Key facts: None yet`;

const CIEL_GREETING = `Hello! I am **Ciel**, your advanced AI assistant — your devoted partner in thought and action.

Before we begin, may I know **your name**?
And how would you prefer me to respond? (Short & concise, Detailed, Friendly, or Professional)`;


const USER_PROFILE_EXTRACT_PROMPT = `Based on this user message, extract any user profile information. Return a JSON object with these optional fields (only include if clearly mentioned):
{
  "name": "user's name if given",
  "language": "hi-IN or en-US or en-IN based on language used",
  "style": "short|detailed|friendly|professional",
  "interests": ["list", "of", "interests"]
}
If nothing can be extracted, return {}
User message: `;

const USER_MD_BOOTSTRAP = `# User Profile
- Name: Unknown
- Language preference: Not set
- Communication style: Not set
- Interests: Not yet determined
- Last updated: {{DATE}}`;


const ALL_PROMPTS = [
  ["Quantum Computing", "Explain quantum computing in simple terms"],
  ["Code: Binary Search", "Write a Python binary search function with explanation"],
  ["Generate Image", "Generate an image of a futuristic neon city at sunset"],
  ["AI Trends 2025", "What are the top AI trends shaping 2025?"],
  ["Write a Poem", "Write a beautiful short poem about the night sky"],
  ["Productivity Tips", "Give me 5 science-backed tips to stay focused and productive"],
  ["Recipe Ideas", "Suggest 3 easy dinner recipes for a busy weeknight"],
  ["Travel Tips", "What are hidden gem travel destinations in Europe?"],
  ["Save Money", "Give me practical tips to save money on a tight budget"],
  ["Workout Plan", "Create a 15-minute home workout I can do daily"],
  ["Book Recommendations", "Recommend 5 must-read books for personal growth"],
  ["Stress Relief", "What are quick techniques to manage stress and anxiety?"],
];


// ── State ──────────────────────────────────
let state = {
  activeChatId: null,
  settings: {
    textModel:  'openai',
    imageModel: 'flux',
    ttsMode:    'browser',
    ttsVoice:   'nova',
    sttLang:    'en-US',
    apiKey:     '',   // Pollinations TTS key
    tavilyKey:  '',   // Tavily web search key
  },
  isGenerating: false,
  cooldownTimer: null,
  cooldownRemaining: 0,
  messageQueue: [],
  recognition: null,
  isRecording: false,
  currentAudio: null,
};

// ── Helpers ────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function now() {
  return new Date().toISOString();
}
function timeStr(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}
function saveState() {
  localStorage.setItem('cielai_settings', JSON.stringify(state.settings));
}
function loadState() {
  try {
    const s = localStorage.getItem('cielai_settings');
    if (s) state.settings = { ...state.settings, ...JSON.parse(s) };
  } catch {}
}

// ── Chat Storage ───────────────────────────
function getAllChats() {
  try { return JSON.parse(localStorage.getItem('cielai_chats') || '{}'); } catch { return {}; }
}
function saveAllChats(chats) {
  localStorage.setItem('cielai_chats', JSON.stringify(chats));
}
function getChat(id) {
  return getAllChats()[id] || null;
}
function saveChat(chat) {
  const chats = getAllChats();
  chats[chat.id] = chat;
  saveAllChats(chats);
}
function deleteChat(id) {
  const chats = getAllChats();
  delete chats[id];
  saveAllChats(chats);
}
function createChat() {
  const id = uid();
  const d = now();
  const chat = {
    id,
    title: 'New Chat',
    createdAt: d,
    updatedAt: d,
    messages: [],
    systemMd: SYSTEM_MD,
    memoryMd: MEMORY_BOOTSTRAP.replace('{{DATE}}', d),
    userMd: USER_MD_BOOTSTRAP.replace('{{DATE}}', d),
    model: state.settings.textModel,
  };
  saveChat(chat);
  return chat;
}

// ── Memory Manager ─────────────────────────
function buildContext(chat) {
  return `${chat.systemMd}\n\n## Memory\n${chat.memoryMd}\n\n## User Profile\n${chat.userMd}`;
}
function estimateTokens(str) {
  return Math.ceil(str.length / 4);
}
async function maybeCompressMemory(chat) {
  // Threshold: ~15,000 characters or 20 messages
  const historyText = chat.messages.map(m => `${m.role}: ${m.content}`).join('\n');
  if (historyText.length < 15000 && chat.messages.length < 20) return chat;

  console.log("💠 [Ciel]: Memory limit reached. Initiating Sinking...");
  if (window.showMemoryIndicator) window.showMemoryIndicator(true);

  try {
    // Compress messages 5 to end-5 (keep bootstrap greeting and very recent context)
    const midPoint = chat.messages.length - 5;
    const toSummarize = chat.messages.slice(5, midPoint).map(m => `${m.role}: ${m.content}`).join('\n');
    
    const summary = await callTextAPI([
      { role: 'user', content: MEMORY_COMPRESS_PROMPT + '\n\nCONVERSATION:\n' + toSummarize }
    ], 'openai', 'Summarize key facts only.');

    // Update memory.md
    chat.memoryMd += `\n\n### Optimization Step (${new Date().toLocaleDateString()})\n${summary}`;
    
    // Replace compressed range with a placeholder message
    const archiveMsg = { id: uid(), role: 'system', content: '💠 [Context Optimized: Previous history archived in Memory]', timestamp: now() };
    chat.messages.splice(5, midPoint - 5, archiveMsg);
    
    saveChat(chat);
    console.log("💠 [Ciel]: Memory Sinking complete.");
  } catch (e) {
    console.error("Memory sinking failed:", e);
  } finally {
    if (window.showMemoryIndicator) window.showMemoryIndicator(false);
  }
  return chat;
}

// ── Pollinations API ───────────────────────
async function callTextAPI(messages, model, system) {
  const body = { messages, model: model || 'openai', system: system || SYSTEM_MD };
  const res = await fetch(POLLINATIONS_TEXT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.text();
}

function buildImageUrl(prompt, model, w, h) {
  const enc = encodeURIComponent(prompt);
  return `${POLLINATIONS_IMAGE}${enc}?model=${model || 'flux'}&width=${w || 768}&height=${h || 512}&nologo=true&enhance=true`;
}

async function callPollinationsAudio(text, voice, apiKey) {
  const cleaned = stripForTTS(text);
  const enc = encodeURIComponent(cleaned.slice(0, 400));
  const url = `${POLLINATIONS_AUDIO}${enc}?voice=${voice || 'nova'}&key=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 401) throw new Error('Invalid API key — check your Pollinations key');
  if (res.status === 402 || res.status === 429) throw new Error('Pollinations credits exhausted — top up at pollinations.ai');
  if (!res.ok) throw new Error(`TTS error (${res.status}) — try again later`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ── TTS ────────────────────────────────────
function stripForTTS(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~|>\[\]()]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/IMAGE:.*/gi, 'image generated')
    .replace(/\n+/g, ' ')
    .trim();
}

async function speakText(text) {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
  window.speechSynthesis?.cancel();

  if (state.settings.ttsMode === 'pollinations' && state.settings.apiKey) {
    try {
      const url = await callPollinationsAudio(text, state.settings.ttsVoice, state.settings.apiKey);
      const audio = new Audio(url);
      state.currentAudio = audio;
      audio.play();
      return;
    } catch (e) {
      // Surface the error — don't silently swallow it
      if (typeof window.cielToast === 'function') window.cielToast(e.message, 'error');
      else console.warn('[TTS]', e.message);
      // Fall through to browser TTS
    }
  }
  // Browser TTS fallback
  if ('speechSynthesis' in window) {
    const utt = new SpeechSynthesisUtterance(stripForTTS(text));
    utt.lang = state.settings.sttLang;
    utt.rate = 1.0;
    window.speechSynthesis.speak(utt);
  }
}

// ── STT ────────────────────────────────────
function initSTT() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false;
  r.interimResults = true;
  r.lang = state.settings.sttLang;
  return r;
}

// ── Rate Limiter ───────────────────────────
function startCooldown(onTick, onDone) {
  state.cooldownRemaining = COOLDOWN_MS / 1000;
  clearInterval(state.cooldownTimer);
  state.cooldownTimer = setInterval(() => {
    state.cooldownRemaining--;
    onTick(state.cooldownRemaining);
    if (state.cooldownRemaining <= 0) {
      clearInterval(state.cooldownTimer);
      state.cooldownTimer = null;
      onDone();
    }
  }, 1000);
}

// ── URL / Share ─────────────────────────────
function getChatIdFromURL() {
  return new URLSearchParams(window.location.search).get('chat');
}
function setChatIdInURL(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('chat', id);
  window.history.replaceState({}, '', url.toString());
}
function buildShareURL(chat) {
  const data = { messages: chat.messages, memoryMd: chat.memoryMd, userMd: chat.userMd, title: chat.title };
  const b64 = btoa(encodeURIComponent(JSON.stringify(data)));
  const url = new URL(window.location.href);
  url.searchParams.set('chat', chat.id);
  url.hash = 'share=' + b64;
  return url.toString();
}
function loadFromShareHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return null;
  try {
    const b64 = hash.slice(7);
    return JSON.parse(decodeURIComponent(atob(b64)));
  } catch { return null; }
}

// ── User Profile Extractor ──────────────────
async function extractAndUpdateUserProfile(chat, userMessage) {
  try {
    const resp = await callTextAPI(
      [{ role: 'user', content: USER_PROFILE_EXTRACT_PROMPT + userMessage }],
      'openai',
      'You extract user profile data and return valid JSON only. Nothing else.'
    );
    const jsonMatch = resp.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const data = JSON.parse(jsonMatch[0]);
    let updated = false;
    if (data.name && chat.userMd.includes('Name: Unknown')) {
      chat.userMd = chat.userMd.replace('Name: Unknown', `Name: ${data.name}`);
      chat.memoryMd = chat.memoryMd.replace('User name: Not yet known', `User name: ${data.name}`);
      updated = true;
    }
    if (data.language && chat.userMd.includes('Language preference: Not set')) {
      chat.userMd = chat.userMd.replace('Language preference: Not set', `Language preference: ${data.language}`);
      chat.memoryMd = chat.memoryMd.replace('User language preference: Not set', `User language preference: ${data.language}`);
      if (data.language === 'hi-IN') state.settings.sttLang = 'hi-IN';
      updated = true;
    }
    if (data.style && chat.userMd.includes('Communication style: Not set')) {
      chat.userMd = chat.userMd.replace('Communication style: Not set', `Communication style: ${data.style}`);
      updated = true;
    }
    if (data.interests?.length && chat.userMd.includes('Interests: Not yet determined')) {
      chat.userMd = chat.userMd.replace('Interests: Not yet determined', `Interests: ${data.interests.join(', ')}`);
      updated = true;
    }
    if (updated) {
      chat.userMd = chat.userMd.replace(/Last updated: .+/, `Last updated: ${new Date().toLocaleDateString()}`);
      saveChat(chat);
    }
  } catch {}
}

// ── Web Search Intent Detection ─────────────
function detectWebSearchIntent(text) {
  const t = text.toLowerCase();
  // Real-time / news / current signals
  const patterns = [
    /\b(latest|current|today|right now|live|breaking|real.?time|2024|2025|2026)\b/i,
    /\b(news|headline|update|trending|happening|stock|price|score|weather|forecast)\b/i,
    /\b(who won|who is winning|match result|election result|search the web|look up|google)\b/i,
    // Hindi/Hinglish
    /\b(aaj ka|abhi ka|taza|taaza|khabar|news|live score|mausam|bhav|rate)\b/i,
    /\b(search kar|web search|internet mein|dhundho|khojo)\b/i,
  ];
  return patterns.some(p => p.test(t));
}

// ── Tavily Web Search ────────────────────────
async function callTavilySearch(query, apiKey) {
  const res = await fetch(TAVILY_SEARCH, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth:   'basic',
      max_results:    5,
      include_answer: true,
      topic:          'general',
    }),
  });
  if (res.status === 401) throw new Error('Invalid Tavily API key');
  if (res.status === 429) throw new Error('Tavily rate limit reached — try again later');
  if (res.status === 402) throw new Error('Tavily credits exhausted — top up at app.tavily.com');
  if (!res.ok)            throw new Error(`Tavily search error (${res.status})`);
  const data = await res.json();

  // Format results as context block for AI
  let ctx = `## Web Search Results for: "${query}"\n`;
  if (data.answer) ctx += `**Summary:** ${data.answer}\n\n`;
  ctx += `**Sources:**\n`;
  (data.results || []).slice(0, 5).forEach((r, i) => {
    ctx += `${i + 1}. [${r.title}](${r.url})\n   ${r.content?.slice(0, 200) || ''}\n`;
  });
  ctx += `\n*Search performed: ${new Date().toUTCString()}*`;
  return ctx;
}

// Catches English and Hindi/Hinglish image requests
function detectImageIntent(text) {
  const t = text.toLowerCase();
  // Hindi/Hinglish keywords
  const hindiImg = /image\s*banao|photo\s*banao|tasveer|tasveeer|pic\s*banao|drawing\s*banao|bana\s*do.*image|image.*bana|generate.*kar/i;
  if (hindiImg.test(t)) return true;
  // English patterns
  const engImg = /\b(generate|create|make|draw|paint|show|design|produce|render)\b[^.]{0,60}\b(image|photo|picture|pic|art|illustration|painting|wallpaper|poster|logo)\b/i;
  if (engImg.test(t)) return true;
  // Direct — "an image of", "a picture of"
  if (/\b(an?|the)\s+(image|photo|picture|pic|illustration)\s+of\b/i.test(t)) return true;
  return false;
}

function extractImagePrompt(text) {
  const match = text.match(/IMAGE:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

// ─────────────────────────────────────────────
//  Export to window for Part 2
// ─────────────────────────────────────────────
window.CielAI = {
  state, uid, now, timeStr, greet,
  saveState, loadState,
  getAllChats, getChat, saveChat, deleteChat, createChat,
  buildContext, maybeCompressMemory,
  callTextAPI, buildImageUrl, callPollinationsAudio,
  speakText, stripForTTS,
  initSTT,
  startCooldown,
  getChatIdFromURL, setChatIdInURL, buildShareURL, loadFromShareHash,
  detectImageIntent, detectWebSearchIntent, callTavilySearch, extractImagePrompt,
  extractAndUpdateUserProfile,
  ALL_PROMPTS, SYSTEM_MD, COOLDOWN_MS,
};
