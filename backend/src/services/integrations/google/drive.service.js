// Google Drive API — Fractal MX project folder management
// Folder structure mirrors 04-INTEGRATIONS.md spec

const axios = require('axios');
const googleAuth = require('./auth.service');

const BASE_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

class DriveService {
  isAvailable() { return googleAuth.isAvailable(); }

  /**
   * Create a folder in Drive
   */
  async createFolder(name, parentId = null) {
    if (!this.isAvailable()) throw new Error('Drive API not configured');
    const headers = await googleAuth.authHeaders();
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId && { parents: [parentId] })
    };
    const response = await axios.post(`${BASE_URL}/files`, metadata, { headers });
    console.log(`[Drive] ✅ Folder created: "${name}" (${response.data.id})`);
    return { id: response.data.id, name, url: `https://drive.google.com/drive/folders/${response.data.id}` };
  }

  /**
   * Upload file from buffer
   */
  async uploadFile(name, buffer, mimeType, parentId = null, metadata = {}) {
    if (!this.isAvailable()) throw new Error('Drive API not configured');
    const headers = await googleAuth.authHeaders();

    const fileMeta = {
      name,
      ...(parentId && { parents: [parentId] }),
      properties: metadata
    };

    const boundary = 'fractal_boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(fileMeta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    const response = await axios.post(`${UPLOAD_URL}/files?uploadType=multipart`, body, {
      headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
      timeout: 120000
    });

    console.log(`[Drive] ✅ File uploaded: "${name}" (${response.data.id})`);
    return { id: response.data.id, name, url: `https://drive.google.com/file/d/${response.data.id}` };
  }

  /**
   * Search for folders by name
   */
  async findFolder(name, parentId = null) {
    if (!this.isAvailable()) return null;
    const headers = await googleAuth.authHeaders();
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;

    const response = await axios.get(`${BASE_URL}/files`, {
      headers,
      params: { q: query, fields: 'files(id,name)', pageSize: 1 }
    });
    return response.data.files?.[0] || null;
  }

  /**
   * Get or create folder (idempotent)
   */
  async getOrCreateFolder(name, parentId = null) {
    const existing = await this.findFolder(name, parentId);
    if (existing) return { id: existing.id, name, url: `https://drive.google.com/drive/folders/${existing.id}` };
    return this.createFolder(name, parentId);
  }

  /**
   * Ensure standard Fractal MX project structure exists
   * /Fractal MX/[client]/[project]/RECURSOS DEL CLIENTE/{logos,fotos,videos,docs}
   */
  async ensureProjectStructure(client, project) {
    const rootId = process.env.DRIVE_ROOT_FOLDER_ID; // Set this after creating root folder
    const clientFolder = await this.getOrCreateFolder(client, rootId || null);
    const projectFolder = await this.getOrCreateFolder(project, clientFolder.id);
    const resourcesFolder = await this.getOrCreateFolder('RECURSOS DEL CLIENTE', projectFolder.id);
    const procesFolder = await this.getOrCreateFolder('EN PROCESO', projectFolder.id);
    const entregasFolder = await this.getOrCreateFolder('ENTREGAS FINALES', projectFolder.id);

    // Sub-folders in RECURSOS
    const logosFolder = await this.getOrCreateFolder('logos', resourcesFolder.id);
    const fotosFolder = await this.getOrCreateFolder('fotos', resourcesFolder.id);
    const videosFolder = await this.getOrCreateFolder('videos', resourcesFolder.id);
    const docsFolder = await this.getOrCreateFolder('docs', resourcesFolder.id);

    return {
      project: projectFolder,
      resources: resourcesFolder,
      logos: logosFolder,
      fotos: fotosFolder,
      videos: videosFolder,
      docs: docsFolder,
      en_proceso: procesFolder,
      entregas: entregasFolder
    };
  }
}

module.exports = new DriveService();
