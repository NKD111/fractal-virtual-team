/**
 * Sentiment analysis con léxico español (MX).
 * Detecta frustración emergente ANTES del red flag explícito.
 * Devuelve: { score, comparative, emotion, vague }
 */

const Sentiment = require('sentiment');

// Léxico ES-MX. Score range típico: -5 a 5.
const ES_LEXICON = {
  // Negativo
  'tarde': -2, 'lento': -2, 'lentos': -2, 'mal': -2, 'malo': -2, 'mala': -2,
  'pésimo': -4, 'pesimo': -4, 'horrible': -4, 'desastre': -4,
  'molesto': -3, 'molesta': -3, 'enojado': -3, 'enojada': -3, 'frustrado': -3, 'frustrada': -3,
  'harto': -3, 'harta': -3, 'cansado': -2, 'cansada': -2,
  'urgente': -1, 'urgia': -2, 'urge': -2, 'tarde': -2,
  'caro': -2, 'carísimo': -3, 'carisimo': -3,
  'feo': -3, 'fea': -3, 'aburrido': -3, 'aburrida': -3,
  'queja': -3, 'reclamo': -3, 'problema': -2, 'problemas': -2,
  'no funciona': -3, 'no sirve': -3, 'roto': -2, 'rota': -2,
  'pero': -1, 'aunque': -1, 'sin embargo': -1,

  // Positivo
  'gracias': 2, 'excelente': 4, 'perfecto': 4, 'genial': 3, 'increíble': 4, 'increible': 4,
  'bueno': 2, 'buena': 2, 'buenos': 2, 'buenas': 2,
  'me encanta': 4, 'me gusta': 3, 'amo': 4, 'fantástico': 4, 'fantastico': 4,
  'rápido': 2, 'rapido': 2, 'eficiente': 3, 'profesional': 2,
  'recomiendo': 3, 'satisfecho': 3, 'satisfecha': 3, 'feliz': 3, 'contento': 3, 'contenta': 3,
  'va': 1, 'listo': 1, 'lista': 1, 'adelante': 2, 'sí': 1, 'si': 1,
  'chido': 3, 'padre': 2, 'padrísimo': 4, 'padrisimo': 4,

  // Vaguedad / inseguridad (no es sentimiento puro pero útil)
  'no sé': -1, 'no se': -1, 'tal vez': 0, 'quizá': 0, 'quiza': 0,
};

const sentiment = new Sentiment();

const VAGUE_PATTERNS = [
  'llamativo', 'bonito', 'algo cool', 'no sé', 'no se', 'lo que sea',
  'algo así', 'algo asi', 'cualquier cosa', 'tú dime', 'tu dime',
  'lo que tú quieras', 'lo que tu quieras', 'sorpréndeme', 'sorprendeme',
  'lo que veas', 'tú decides', 'tu decides', 'algo creativo', 'algo viral',
];

function isVague(text) {
  if (!text || text.trim().length < 10) return true;
  const t = text.toLowerCase();
  return VAGUE_PATTERNS.some(p => t.includes(p));
}

function classifyEmotion(score) {
  if (score >= 4) return 'muy_positivo';
  if (score >= 2) return 'positivo';
  if (score > -2) return 'neutral';
  if (score > -4) return 'negativo';
  return 'muy_negativo';
}

function analyze(text) {
  if (!text || typeof text !== 'string') {
    return { score: 0, comparative: 0, emotion: 'neutral', vague: false };
  }

  const result = sentiment.analyze(text, { extras: ES_LEXICON });

  return {
    score: result.score,
    comparative: Number(result.comparative.toFixed(3)),
    emotion: classifyEmotion(result.score),
    vague: isVague(text),
  };
}

module.exports = { analyze, isVague, classifyEmotion };
