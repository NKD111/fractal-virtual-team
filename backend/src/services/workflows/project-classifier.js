// PROJECT CLASSIFIER — Mariana uses this before any production work
// Determines: workflow type, required assets, appropriate agents, delivery specs

class ProjectClassifier {

  /**
   * Classify incoming project request
   * @param {string} description - Client/Neiky request text
   * @param {object} answers - Optional explicit answers about format/purpose
   * @returns {ProjectClassification}
   */
  classify(description, answers = {}) {
    const lower = description.toLowerCase();

    // Determine output format
    const format = this._detectFormat(lower, answers);
    // Determine purpose/medium
    const medium = this._detectMedium(lower, answers);
    // Determine if editable files needed
    const needsEditable = this._detectEditableNeeded(lower, answers);
    // Determine assigned designer
    const designer = this._selectDesigner(lower, medium, format);
    // Determine image generation model
    const imageModel = this._selectImageModel(lower, medium, format);
    // Determine QC requirements
    const qcRules = this._getQCRules(medium, format);

    const workflow = this._buildWorkflow({ format, medium, needsEditable, designer, imageModel, qcRules });

    return {
      workflow,
      format,
      medium,
      needsEditable,
      designer,
      imageModel,
      qcRules,
      deliverables: workflow.deliverables,
      assetRequirements: this._getAssetRequirements(lower),
      briefQuestions: this._getMissingInfo(lower, answers)
    };
  }

  _detectFormat(lower, answers) {
    if (answers.format) return answers.format;
    if (['svg', 'vector', 'eps', 'ai file'].some(k => lower.includes(k))) return 'svg';
    if (['psd', 'photoshop', 'editable'].some(k => lower.includes(k))) return 'psd';
    if (['pdf', 'imprimir', 'print', 'lona', 'cartel', 'flyer impres'].some(k => lower.includes(k))) return 'pdf-print';
    if (['mp4', 'video', 'reel', 'animacion', 'animación', 'motion'].some(k => lower.includes(k))) return 'mp4';
    if (['gif', 'animated'].some(k => lower.includes(k))) return 'gif';
    return 'png'; // default digital
  }

  _detectMedium(lower, answers) {
    if (answers.medium) return answers.medium;
    if (['instagram', 'reel', 'tiktok', 'stories', 'feed', 'post'].some(k => lower.includes(k))) return 'social_media';
    if (['lona', 'cartel', 'flyer', 'stand', 'impresion', 'impresión', 'imprimir', 'roll up'].some(k => lower.includes(k))) return 'print';
    if (['web', 'landing', 'banner web', 'sitio'].some(k => lower.includes(k))) return 'web';
    if (['video', 'reel', 'animacion'].some(k => lower.includes(k))) return 'video';
    return 'social_media'; // most common default
  }

  _detectEditableNeeded(lower, answers) {
    if (answers.needsEditable !== undefined) return answers.needsEditable;
    return ['editable', 'ai file', 'psd', 'figma', 'canva', 'fuente', 'font', 'capas', 'layers'].some(k => lower.includes(k));
  }

  _selectDesigner(lower, medium, format) {
    // MAX handles video
    if (['video', 'reel', 'animacion', 'motion'].some(k => lower.includes(k))) return 'MAX';
    // CARLOS: bold branding, experimental
    if (['logo', 'branding', 'identidad', 'brand'].some(k => lower.includes(k))) return 'CARLOS';
    // DIEGO: editorial, print, corporate
    if (['editorial', 'articulo', 'artículo', 'print', 'lona', 'corporat'].some(k => lower.includes(k))) return 'DIEGO';
    // Default: DIEGO for most client work
    return 'DIEGO';
  }

  _selectImageModel(lower, medium, format) {
    if (format === 'svg') return 'recraft-v3';
    if (format === 'mp4') return 'higgsfield-video';
    if (['persona', 'gente', 'emprendedor', 'empresario', 'chef', 'lifestyle'].some(k => lower.includes(k))) return 'higgsfield';
    return 'dalle-3';
  }

  _getQCRules(medium, format) {
    const base = ['no text artifacts', 'no AI distortion', 'brand colors correct'];

    if (medium === 'print' || format === 'pdf-print') {
      return [...base, 'CMYK color space', '300 DPI minimum', 'bleed 3-5mm', 'crop marks', 'layers correctly named', 'background full canvas', 'text editable'];
    }
    if (medium === 'social_media') {
      return [...base, 'RGB color space', 'correct dimensions', 'web optimized', 'CTAs visible'];
    }
    if (format === 'mp4') {
      return [...base, 'aspect ratio correct', '1080p resolution', 'audio no clipping', 'color grading consistent'];
    }
    return base;
  }

  _buildWorkflow({ format, medium, needsEditable, designer, imageModel, qcRules }) {
    const workflows = {
      social_digital: {
        type: 'digital_simple',
        designer,
        imageModel,
        deliverables: {
          final: ['PNG 1080x1350 (portrait)', 'PNG 1080x1080 (cuadrado)', 'JPG web-optimized'],
          editable: needsEditable ? ['PSD con capas', 'Figma frame'] : []
        },
        colorSpace: 'RGB',
        resolution: '72-150 DPI',
        deliveryTime: '24-48h'
      },
      print_professional: {
        type: 'print_professional',
        designer: 'DIEGO',
        imageModel: 'recraft-v3',
        deliverables: {
          final: ['PDF print-ready CMYK con bleed', 'PDF preview RGB'],
          editable: needsEditable ? ['AI (Adobe Illustrator)', 'EPS', 'Fonts package'] : []
        },
        colorSpace: 'CMYK',
        resolution: '300 DPI minimum',
        bleed: '3-5mm',
        deliveryTime: '48-72h',
        criticalRules: {
          backgrounds: 'FULL_LAYER_NO_CLIPPING',
          images: 'PRESERVE_AS_RASTER',
          text: 'EDITABLE_FONTS',
          shapes: 'NATIVE_VECTORS'
        }
      },
      video: {
        type: 'video',
        designer: 'MAX',
        imageModel: 'higgsfield-video',
        deliverables: {
          final: ['MP4 1080p H.264', 'MP4 1080x1920 (vertical)', 'GIF preview'],
          editable: needsEditable ? ['AEP (After Effects)'] : []
        },
        colorSpace: 'RGB',
        resolution: '1080p',
        deliveryTime: '72h'
      }
    };

    if (medium === 'print' || format === 'pdf-print') return workflows.print_professional;
    if (medium === 'video' || format === 'mp4') return workflows.video;
    return workflows.social_digital;
  }

  _getAssetRequirements(lower) {
    const needed = [];
    if (['logo', 'brand', 'marca'].some(k => lower.includes(k))) needed.push('Logo del cliente (AI, EPS, o PNG alta res)');
    if (['foto', 'speaker', 'persona', 'gente'].some(k => lower.includes(k))) needed.push('Fotos en alta resolución (JPG/PNG mín 300dpi)');
    if (['video', 'footage', 'metraje'].some(k => lower.includes(k))) needed.push('Video footage en formato original (MP4/MOV)');
    if (['texto', 'copy', 'info', 'datos'].some(k => lower.includes(k))) needed.push('Copy/texto final aprobado');
    if (['manual', 'brandbook', 'lineamientos'].some(k => lower.includes(k))) needed.push('Manual de marca o brandbook');
    return needed;
  }

  _getMissingInfo(lower, answers) {
    const questions = [];
    if (!answers.medium && !['instagram', 'print', 'web', 'video', 'lona'].some(k => lower.includes(k))) {
      questions.push('¿Para qué medio? (redes sociales / impresión / web / video)');
    }
    if (!answers.dimensions && !['1080', '1920', 'a4', 'a5', 'carta'].some(k => lower.includes(k))) {
      questions.push('¿Dimensiones específicas?');
    }
    if (!answers.needsEditable && !['editable', 'psd', 'ai ', 'figma'].some(k => lower.includes(k))) {
      questions.push('¿Necesitas archivo editable? ¿En qué formato? (AI, PSD, Figma, Canva)');
    }
    return questions;
  }

  /**
   * Format classification as human-readable summary for Mariana
   */
  formatSummary(classification) {
    const { workflow, designer, imageModel, deliverables, briefQuestions } = classification;
    return `
WORKFLOW: ${workflow.type} | DISEÑADOR: ${designer} | MODELO: ${imageModel}
ENTREGABLES: ${deliverables.final.join(', ')}${deliverables.editable?.length ? ` + EDITABLES: ${deliverables.editable.join(', ')}` : ''}
TIEMPO: ${workflow.deliveryTime}
${briefQuestions.length > 0 ? `\nPREGUNTAS PENDIENTES:\n${briefQuestions.map(q => `• ${q}`).join('\n')}` : '✅ Info completa — listo para iniciar'}`;
  }
}

module.exports = new ProjectClassifier();
