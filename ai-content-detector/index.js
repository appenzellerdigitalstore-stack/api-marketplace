/**
 * /api/ai-content-detector
 * Analyzes text for signals that indicate AI-generated content.
 * Uses statistical/heuristic signals: perplexity proxy, burstiness,
 * sentence uniformity, vocabulary richness, filler phrase patterns,
 * and passive voice density.
 *
 * NOTE: No single heuristic is definitive. Results are probabilistic signals,
 * not ground truth. This mimics the approach of tools like GPTZero (pattern-based).
 */
const express = require('express');
const { errorResponse } = require('../shared/utils');
const { getPlan } = require('../shared/planFilter');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// Linguistic signal extractors
// ──────────────────────────────────────────────

// Common AI filler phrases
const AI_PHRASES = [
  /\bin the realm of\b/i,
  /\bdelve into\b/i,
  /\bit is worth noting\b/i,
  /\bfurthermore\b/i,
  /\bin conclusion\b/i,
  /\bin summary\b/i,
  /\bto summarize\b/i,
  /\bit is important to note\b/i,
  /\bit's worth mentioning\b/i,
  /\bsignificantly\b/i,
  /\bmoreover\b/i,
  /\bhowever, it is\b/i,
  /\bultimately\b/i,
  /\bnotably\b/i,
  /\bin today's (?:world|society|digital age|landscape)\b/i,
  /\bseamlessly\b/i,
  /\blocal(?:ly)? and global(?:ly)?\b/i,
  /\bever-changing\b/i,
  /\blandscape\b/i,
  /\bcutting-edge\b/i,
  /\bstate-of-the-art\b/i,
  /\bleverage\b/i,
  /\bunderscores\b/i,
  /\bfostering\b/i,
  /\bempowering\b/i,
];

const PASSIVE_VOICE_RE = /\b(?:is|are|was|were|be|been|being)\s+\w+ed\b/gi;

function getSentences(text) {
  return (text.match(/[^.!?]+[.!?]+/g) || []).map(s => s.trim()).filter(s => s.length > 10);
}

function getWords(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
}

// Burstiness: variance in sentence length (human text tends to vary more)
function computeBurstiness(sentences) {
  if (sentences.length < 3) return 0;
  const lengths = sentences.map(s => s.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
  return Math.sqrt(variance); // standard deviation
}

// Vocabulary richness: type-token ratio (unique words / total words)
function computeTTR(words) {
  if (words.length === 0) return 0;
  const unique = new Set(words);
  return unique.size / words.length;
}

// Average sentence length
function avgSentenceLength(sentences) {
  if (sentences.length === 0) return 0;
  return sentences.reduce((s, sent) => s + sent.split(/\s+/).length, 0) / sentences.length;
}

// Repetitive transition detection
function countAIPhrases(text) {
  return AI_PHRASES.reduce((count, re) => count + (re.test(text) ? 1 : 0), 0);
}

// Passive voice density
function passiveDensity(text, sentences) {
  const matches = (text.match(PASSIVE_VOICE_RE) || []).length;
  return sentences.length > 0 ? matches / sentences.length : 0;
}

// Paragraph uniformity (AI tends to write similar-length paragraphs)
function paragraphUniformity(text) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
  if (paragraphs.length < 2) return 0;
  const lengths = paragraphs.map(p => p.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lengths.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation; lower = more uniform
  return Math.max(0, 1 - cv); // high = uniform = AI signal
}

// ──────────────────────────────────────────────
// Score aggregator
// ──────────────────────────────────────────────

function computeAIScore(text) {
  const sentences = getSentences(text);
  const words = getWords(text);

  if (words.length < 20) {
    return { error: 'Text too short for analysis (minimum ~20 words)' };
  }

  const burstiness    = computeBurstiness(sentences);    // low = AI signal
  const ttr           = computeTTR(words);               // low = AI signal
  const avgLen        = avgSentenceLength(sentences);    // very uniform = AI signal
  const aiPhrases     = countAIPhrases(text);            // high = AI signal
  const passiveDens   = passiveDensity(text, sentences); // high = AI signal
  const paraUniform   = paragraphUniformity(text);       // high = AI signal

  // Normalize signals to 0–1 where 1 = strong AI signal
  const signals = {
    low_burstiness:       Math.max(0, 1 - burstiness / 12),      // stdev < 5 is suspicious
    low_vocabulary_richness: Math.max(0, 1 - (ttr - 0.3) / 0.5), // TTR < 0.5 is suspicious
    ai_phrase_density:    Math.min(1, aiPhrases / 5),             // 5+ hits = 1.0
    passive_voice:        Math.min(1, passiveDens / 0.4),         // 40% passive = 1.0
    paragraph_uniformity: paraUniform,
  };

  // Weighted average
  const weights = {
    low_burstiness:          0.25,
    low_vocabulary_richness: 0.20,
    ai_phrase_density:       0.30,
    passive_voice:           0.10,
    paragraph_uniformity:    0.15,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (signals[key] || 0) * weight;
  }
  score = Math.round(Math.min(1, Math.max(0, score)) * 100);

  const label = score >= 75 ? 'likely_ai'
              : score >= 50 ? 'possibly_ai'
              : score >= 25 ? 'uncertain'
              : 'likely_human';

  return {
    ai_probability: score,
    label,
    word_count: words.length,
    sentence_count: sentences.length,
    signals: {
      burstiness_score: Math.round(burstiness * 10) / 10,
      vocabulary_richness: Math.round(ttr * 100) / 100,
      avg_sentence_length: Math.round(avgLen * 10) / 10,
      ai_phrases_detected: aiPhrases,
      passive_voice_density: Math.round(passiveDens * 100) / 100,
      paragraph_uniformity: Math.round(paraUniform * 100) / 100,
    },
  };
}

// ──────────────────────────────────────────────
// Route
// ──────────────────────────────────────────────

app.post('/api/ai-content-detector', (req, res) => {
  const plan = getPlan(req);
  const { text } = { ...req.query, ...req.body };

  if (!text || typeof text !== 'string') {
    return errorResponse(res, 400, 'text is required');
  }

  const maxChars = plan === 'free' ? 1000 : plan === 'pro' ? 5000 : 25000;
  if (text.length > maxChars) {
    return errorResponse(res, 400, `Text exceeds plan limit of ${maxChars} characters`);
  }

  const analysis = computeAIScore(text);

  if (analysis.error) {
    return errorResponse(res, 400, analysis.error);
  }

  const result = {
    ai_probability: analysis.ai_probability,
    label: analysis.label,
    word_count: analysis.word_count,
    sentence_count: analysis.sentence_count,
    ...(plan !== 'free' && { signals: analysis.signals }),
    ...(plan === 'ultra' || plan === 'mega'
      ? {
          interpretation: {
            likely_ai:    'High probability of AI generation (75–100%)',
            possibly_ai:  'Moderate AI signals detected (50–74%)',
            uncertain:    'Mixed signals, could be either (25–49%)',
            likely_human: 'Low AI signals, likely human-written (0–24%)',
          }[analysis.label],
          disclaimer: 'Results are probabilistic heuristics, not ground truth. Human-like AI text and formal human writing can produce similar scores.',
        }
      : {}),
    plan,
  };

  res.json({ success: true, data: result });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3017;
  app.listen(PORT, () => console.log(`ai-content-detector running on port ${PORT}`));
}

module.exports = app;
