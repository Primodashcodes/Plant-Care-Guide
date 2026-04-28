const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

const GEMINI_KEY   = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

app.post('/api/identify', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });
    if (!GEMINI_KEY) return res.status(500).json({ error: 'API key not configured on server.' });

    const prompt = `You are an expert botanist and plant identification AI.
Analyze the provided image carefully and identify the plant.

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text.

If a plant is clearly visible, use this format:
{"found":true,"name":"Common Name","scientific":"Genus species","emoji":"🌿","description":"2-3 sentence description.","water":"Watering care instructions.","sunlight":"Light requirements.","soil":"Soil type needed.","care_tip":"One practical care tip.","interesting_fact":"One interesting fact about this plant."}

If no plant is visible or you cannot identify it:
{"found":false,"reason":"Brief explanation."}`;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'text/plain' }
      })
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      // Log the full error on server for easier debugging
      console.error('Gemini API error:', geminiRes.status, errBody);
      return res.status(geminiRes.status).json({ error: errBody?.error?.message || `HTTP ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    res.json(data);

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Plant Care Guide running on port ${PORT}`));