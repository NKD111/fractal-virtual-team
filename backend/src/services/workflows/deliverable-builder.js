// backend/src/services/workflows/deliverable-builder.js
// Builds structured delivery specs for each project type
// Diego/Carlos/Max use this to know exactly what to produce and how

class DeliverableBuilder {

  /**
   * Build complete delivery spec for a project
   * @param {object} classification - from ProjectClassifier.classify()
   * @param {object} projectInfo - { client, projectName, deadline }
   */
  build(classification, projectInfo = {}) {
    const { workflow, designer, imageModel, qcRules } = classification;
    const spec = this._buildSpec(workflow, classification, projectInfo);
    return {
      ...spec,
      designer,
      imageModel,
      qcRules,
      folderStructure: this._buildFolderStructure(projectInfo),
      specsJson: this._buildSpecsJson(spec, projectInfo)
    };
  }

  _buildSpec(workflow, classification, projectInfo) {
    const base = {
      client: projectInfo.client || 'Cliente',
      project: projectInfo.projectName || 'Proyecto',
      deadline: projectInfo.deadline || 'Por definir',
      colorSpace: workflow.colorSpace || 'RGB',
      resolution: workflow.resolution || '72 DPI',
      deliveryTime: workflow.deliveryTime || '24-48h'
    };

    if (workflow.type === 'print_professional') {
      return {
        ...base,
        type: 'print_professional',
        canvas: { colorSpace: 'CMYK', resolution: '300 DPI', bleed: '3-5mm', cropMarks: true },
        layerRules: {
          layer1: 'FONDO — color/gradiente full canvas, sin recortes',
          layer2: 'ELEMENTOS DECORATIVOS — shapes independientes',
          layer3: 'IMÁGENES — raster PNG con transparencia, nunca vectorizar fotos',
          layer4: 'GRÁFICOS VECTORIALES — ilustraciones e iconos nativos',
          layer5: 'TEXTO — fuentes editables, no trazadas, empaquetar en entrega',
          layer6: 'LOGOS — vector original del cliente, nunca recrear'
        },
        finalFormats: ['PDF print-ready CMYK con bleed y marcas de corte', 'PDF preview RGB sin marcas'],
        editableFormats: classification.needsEditable ? ['AI (Adobe Illustrator multilayer)', 'EPS', 'Fonts Package (ZIP)'] : [],
        previewFormats: ['PNG RGB 150dpi para aprobación', 'JPG thumbnail para chat'],
        criticalChecks: ['CMYK verified', '300dpi+', 'bleed present', 'no clipping masks on backgrounds', 'text editable', 'fonts packaged', 'logo is original vector']
      };
    }

    if (workflow.type === 'video') {
      return {
        ...base,
        type: 'video',
        canvas: { aspectRatios: ['16:9 (1920x1080)', '9:16 (1080x1920)', '1:1 (1080x1080)'], fps: 24, codec: 'H.264' },
        finalFormats: ['MP4 1080p H.264 (horizontal)', 'MP4 1080x1920 (vertical/Reels)', 'GIF preview 480p'],
        editableFormats: classification.needsEditable ? ['AEP (After Effects Project + assets)'] : [],
        previewFormats: ['MP4 preview 720p', 'Thumbnail JPG'],
        criticalChecks: ['aspect ratio correct', '1080p+', 'audio levels -6 to -12 dB', 'no clipping', 'color grading consistent', 'captions/subtitles correct', 'logo at correct moment']
      };
    }

    // Default: digital/social
    return {
      ...base,
      type: 'digital_social',
      canvas: { colorSpace: 'RGB', resolution: '72-150 DPI' },
      dimensions: {
        instagram_feed_portrait: '1080x1350px (4:5)',
        instagram_feed_square: '1080x1080px (1:1)',
        instagram_stories: '1080x1920px (9:16)',
        linkedin_post: '1200x627px (1.91:1)',
        facebook_post: '1200x630px'
      },
      finalFormats: ['PNG 1080x1350 optimizado web', 'JPG fallback', 'PNG 1080x1080 cuadrado'],
      editableFormats: classification.needsEditable ? ['PSD con capas nombradas', 'Figma frame exportable'] : [],
      previewFormats: ['JPG 72dpi para aprobación por WhatsApp/email'],
      criticalChecks: ['RGB color space', 'brand colors exact hex', 'no text artifacts', 'typography correct', 'CTAs visible', 'logo correct version', 'dimensions exact']
    };
  }

  _buildFolderStructure(projectInfo) {
    const base = `${projectInfo.client || 'CLIENTE'}_${projectInfo.projectName || 'PROYECTO'}_v1`;
    return {
      root: base,
      subfolders: ['EDITABLES/', 'PREVIEWS/', 'ASSETS/images/', 'ASSETS/fonts/', 'ASSETS/logos/', 'EXPORTS/print/', 'EXPORTS/digital/', 'EXPORTS/web/'],
      readme: `README.txt con: cliente, fecha, specs técnicas, lista de fuentes, notas de producción`
    };
  }

  _buildSpecsJson(spec, projectInfo) {
    return JSON.stringify({
      client: spec.client,
      project: spec.project,
      type: spec.type,
      colorSpace: spec.colorSpace,
      resolution: spec.resolution,
      deadline: spec.deadline,
      generatedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Format delivery spec as text summary for agents
   */
  formatForAgent(deliverable) {
    const lines = [
      `📦 SPEC DE ENTREGA — ${deliverable.project} (${deliverable.type})`,
      `Cliente: ${deliverable.client} | Deadline: ${deliverable.deadline}`,
      `Diseñador: ${deliverable.designer} | Modelo imagen: ${deliverable.imageModel}`,
      ``,
      `🎨 CANVAS: ${deliverable.colorSpace} · ${deliverable.resolution}`,
      deliverable.canvas?.bleed ? `Bleed: ${deliverable.canvas.bleed} | Crop marks: Sí` : '',
      ``,
      `📁 ENTREGABLES FINALES:`,
      ...(deliverable.finalFormats || []).map(f => `  ✓ ${f}`),
      deliverable.editableFormats?.length ? `\n📝 EDITABLES:\n${deliverable.editableFormats.map(f => `  ✓ ${f}`).join('\n')}` : '',
      ``,
      `🛡️ QC OBLIGATORIO:`,
      ...(deliverable.qcRules || []).map(r => `  □ ${r}`)
    ].filter(l => l !== undefined);

    if (deliverable.layerRules) {
      lines.push(`\n📐 REGLAS DE CAPAS (print):`);
      Object.entries(deliverable.layerRules).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
    }

    return lines.join('\n');
  }
}

module.exports = new DeliverableBuilder();
