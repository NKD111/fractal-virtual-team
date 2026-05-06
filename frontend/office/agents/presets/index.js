// frontend/office/agents/presets/index.js
// Look + outfit presets for the 11 agents (10 humans + QC-Bot).

export const AGENT_PRESETS = {
  mariana: {
    name: 'Mariana', color: '#FF6B9D', skinTone: '#F0C5A0',
    hairStyle: 'long', hairColor: '#3D2817',
    shirtColor: '#FF6B9D', pantsColor: '#2D3F55', shoeColor: '#1a1a2e',
    accessory: null, role: 'Hub Coordinator',
    description: 'Coordinadora central del equipo'
  },
  diana: {
    name: 'Diana', color: '#9B59B6', skinTone: '#E8B894',
    hairStyle: 'bun', hairColor: '#1a1a1a',
    shirtColor: '#9B59B6', pantsColor: '#2c2c2c', shoeColor: '#1a1a2e',
    accessory: 'tie', tieColor: '#FFFFFF',
    role: 'Senior Client Manager',
    description: 'Ex-Ogilvy, manejo ejecutivo'
  },
  alex: {
    name: 'Alex', color: '#3498DB', skinTone: '#D9A574',
    hairStyle: 'short', hairColor: '#3D2817',
    shirtColor: '#3498DB', pantsColor: '#5D4E37', shoeColor: '#8B4513',
    accessory: 'headphones',
    role: 'Content Creator',
    description: 'Hipster Guadalajara, social media'
  },
  carlos: {
    name: 'Carlos', color: '#FF6B35', skinTone: '#C8956D',
    hairStyle: 'short', hairColor: '#1a1a1a',
    shirtColor: '#FF6B35', pantsColor: '#2D3F55', shoeColor: '#1a1a2e',
    accessory: 'apron',
    role: 'Senior Designer',
    description: 'Branding y visual systems'
  },
  sofia: {
    name: 'Sofia', color: '#27AE60', skinTone: '#F0C5A0',
    hairStyle: 'long', hairColor: '#8B4513',
    shirtColor: '#27AE60', pantsColor: '#2D3F55', shoeColor: '#27AE60',
    accessory: null, role: 'Project Manager',
    description: 'Wellness, Querétaro'
  },
  lucas: {
    name: 'Lucas', color: '#F39C12', skinTone: '#D9A574',
    hairStyle: 'short', hairColor: '#3D2817',
    shirtColor: '#F39C12', pantsColor: '#2D3F55', shoeColor: '#1a1a2e',
    accessory: null, glasses: true,
    role: 'Analytics',
    description: 'Ex-Google, regio bilingüe'
  },
  diego: {
    name: 'Diego', color: '#607D8B', skinTone: '#C8956D',
    hairStyle: 'beard', hairColor: '#1a1a1a',
    shirtColor: '#607D8B', pantsColor: '#1a1a2e', shoeColor: '#1a1a2e',
    accessory: null,
    role: 'Senior Designer Editorial',
    description: 'Editorial y corporate, San Ángel'
  },
  max: {
    name: 'Max', color: '#E74C3C', skinTone: '#D9A574',
    hairStyle: 'short', hairColor: '#1a1a1a',
    shirtColor: '#E74C3C', pantsColor: '#2c2c2c', shoeColor: '#1a1a2e',
    accessory: 'headphones',
    role: 'AI Video Editor',
    description: 'Tijuana, Higgsfield'
  },
  valentina: {
    name: 'Valentina', color: '#8E44AD', skinTone: '#F0C5A0',
    hairStyle: 'curly', hairColor: '#5D3A1F',
    shirtColor: '#8E44AD', pantsColor: '#2c2c2c', shoeColor: '#8E44AD',
    accessory: null,
    role: 'Art Director',
    description: 'Dirección creativa senior'
  },
  roberto: {
    name: 'Roberto', color: '#16A085', skinTone: '#C8956D',
    hairStyle: 'bald', hairColor: '#1a1a1a',
    shirtColor: '#FFFFFF', pantsColor: '#1a1a2e', shoeColor: '#1a1a2e',
    accessory: 'tie', tieColor: '#16A085', glasses: true,
    role: 'CFO',
    description: 'Polanco, ex-PWC'
  },
  qcbot: {
    name: 'QC-Bot', color: '#7F8C8D', skinTone: '#B8B8C0',
    hairStyle: 'bald', hairColor: '#1a1a1a',
    shirtColor: '#34495E', pantsColor: '#1a1a2e', shoeColor: '#1a1a2e',
    accessory: null, glasses: true,
    role: 'Quality Control Bot',
    description: 'Sistema automatizado'
  },
  axiom: {
    name: 'AXIOM', color: '#00D4FF', skinTone: '#B4D9DD',
    hairStyle: 'short', hairColor: '#0E2A33',
    shirtColor: '#00D4FF', pantsColor: '#0E1B2A', shoeColor: '#0a0a14',
    accessory: 'visor',
    role: 'Opportunity Scanner',
    description: 'Bot autónomo — escanea oportunidades cada 6h',
    is_bot: true,
    placeholder: true
  }
};

// Office floor positions for each agent (x, z) — laid out as a grid
export const AGENT_POSITIONS = {
  mariana:   { x:  0, z:  0, label: 'Hub Central'      },
  diana:     { x:  4, z: -2, label: 'Client Relations' },
  carlos:    { x: -4, z:  2, label: 'Design Studio L'  },
  diego:     { x: -4, z: -2, label: 'Design Studio R'  },
  alex:      { x: -2, z:  4, label: 'Content'          },
  max:       { x:  2, z:  4, label: 'Video Bay'        },
  valentina: { x:  0, z: -4, label: 'Art Direction'    },
  sofia:     { x:  4, z:  2, label: 'PM Desk'          },
  lucas:     { x:  6, z:  0, label: 'Analytics'        },
  roberto:   { x: -6, z:  0, label: 'Finance Office'   },
  qcbot:     { x:  0, z:  4, label: 'QC Station'       },
  axiom:     { x:  6, z: -3, label: 'AXIOM Scanner'    }
};
