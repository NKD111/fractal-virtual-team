const Sentiment = require('sentiment');
const engine = new Sentiment();

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter(t => t.length > 1);
}

function analyzeSentiment(text) {
  const result = engine.analyze(text);
  if (result.score > 2) return 'positive';
  if (result.score < -2) return 'negative';
  return 'neutral';
}

module.exports = { normalize, tokenize, analyzeSentiment };
