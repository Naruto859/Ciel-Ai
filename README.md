# 💠 Ciel AI — Advanced AI Chat Application

<div align="center">

![Ciel AI Banner](https://image.pollinations.ai/prompt/futuristic%20AI%20chat%20interface%20glowing%20cyan%20purple%20minimalist%20dark%20background%20logo?width=1200&height=400&model=flux&nologo=true)

**A hyper-intelligent, AI chat app powered entirely by [Pollinations.ai](https://pollinations.ai) free APIs.**  
No backend. No database. No sign-up required. Just open and chat.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Open%20App-7c5cfc?style=for-the-badge)](https://your-deployment-url.vercel.app)
[![Pollinations](https://img.shields.io/badge/Powered%20by-Pollinations.ai-06b6d4?style=for-the-badge)](https://pollinations.ai)
[![License](https://img.shields.io/badge/License-MIT-34d399?style=for-the-badge)](LICENSE)

</div>

---

## ✨ Features

### 🧠 Ciel — God-Tier AI Persona
- Inspired by **Ciel (Great Sage / Raphael: Lord of Wisdom)** from *That Time I Got Reincarnated as a Slime*
- Hyper-intelligent, polite, devoted, and proactive
- Auto-greets new users, asks for their name & preferred style on first launch
- Adapts language dynamically: **Hindi 🇮🇳 / Hinglish / English**

### 📁 3-File Agentic Memory (Per Chat)
| File | Purpose |
|---|---|
| `system.md` | AI persona, rules, image detection logic, language adaptation |
| `memory.md` | Running long-term memory with auto-summarization |
| `user.md` | User profile — name, language, style, interests (auto-updated) |

- **Auto-summarization**: When conversation grows large, older messages are compressed and stored in `memory.md`
- **Dynamic profiling**: `user.md` is silently updated as the AI learns about you

### 💬 Smart Chat Features
- **Markdown rendering** with `marked.js`
- **Syntax-highlighted code blocks** with copy button (via `highlight.js`)
- **Image generation** — auto-detected from messages OR via dedicated panel
- **Dual TTS**: Free (Web Speech API) + Premium (Pollinations audio, 30+ voices)
- **STT Microphone**: Hindi / Hinglish / English voice input
- **16-second rate-limit queue** with live countdown timer and auto-send

### 🔗 URL Sharing
- Every chat has a unique ID: `?chat=abc123`
- **Share button** generates a full state link (base64 encoded)
- Friends can open the link and continue your exact conversation

### ⚙️ Model Selection
| Type | Models |
|---|---|
| Text | GPT-4o (`openai`), Mistral, Llama, **SearchGPT 🔍** (web search) |
| Image | Flux, Turbo, Flux Realism |

### 🎨 UI/UX
- **Dark / Light mode** toggle
- **Glassmorphism** design with electric violet + cyan palette
- Animated AI avatar (conic-gradient orb)
- Mobile-first, responsive sidebar
- Suggested prompts with refresh
- Chat history, rename, export, delete

---

## 🚀 Getting Started

### Option 1: Just open the file (No install needed)
```bash
# Clone the repo
git clone https://github.com/Naruto859/Ciel-Ai.git
cd ciel-ai

# Open in browser
start index.html   # Windows
open index.html    # Mac
```

### Option 2: Serve locally
```bash
# Python
python -m http.server 3000

# Node.js
npx serve .

# Then open http://localhost:3000
```

### Option 3: Deploy to Vercel / Netlify
```bash
# Vercel
npx vercel deploy

# Or drag-and-drop the folder to netlify.com/drop
```

---

## 📁 File Structure

```
ciel-ai/
├── index.html      # Main HTML — all UI structure
├── style.css       # Complete styling — dark/light, animations
├── app.js          # Core logic — chat engine, APIs, memory, TTS, STT
├── ui.js           # UI layer — event handlers, rendering
└── README.md       # This file
```

---

## 🔑 API Keys (Optional)

Ciel AI works **completely free** without any API key:

| Feature | No Key | With Pollinations `Sk_` Key |
|---|---|---|
| Text generation | ✅ Free | ✅ Free |
| Image generation | ✅ Free | ✅ Free |
| TTS (browser) | ✅ Free | ✅ Free |
| TTS (Pollinations audio) | ❌ | ✅ 30+ voices |
| SearchGPT model | ✅ Free | ✅ Free |

Get your free `sk_` key at **[enter.pollinations.ai](https://enter.pollinations.ai)**  
Then add it in **Settings → API Key**.

---

## 🎙️ API Endpoints Used

```
Text:  POST https://text.pollinations.ai/
Image: GET  https://image.pollinations.ai/prompt/{prompt}?model=flux
Audio: GET  https://gen.pollinations.ai/audio/{text}?voice=nova&key=YOUR_KEY
STT:   Browser Web Speech API (free, no endpoint)
```

---

## ⚡ Rate Limiting

The app uses a **16-second cooldown queue** between API calls:
- Keeps usage well within Pollinations.ai's free tier limits
- If you send a message during cooldown, it shows **⏳ Queued**
- Auto-sends when the cooldown expires (countdown visible)

---

## 🗺️ Roadmap

- [ ] PWA support (installable on mobile)
- [ ] Voice responses auto-play toggle
- [ ] Multi-image generation in one message
- [ ] Chat folders / tags
- [ ] Export chat as PDF
- [ ] Custom system prompt editor in UI

---

## 🤝 Contributing

PRs are welcome! Please open an issue first to discuss what you'd like to change.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

Made with 💠 by the Ciel AI team · Powered by [Pollinations.ai](https://pollinations.ai)

</div>
