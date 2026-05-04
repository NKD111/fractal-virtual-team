// RESOURCES MANAGER — Processes client materials sent to proyectosfractalmx@gmail.com
// Part C of 04-INTEGRATIONS.md

const gmailService = require('../integrations/google/gmail.service');
const driveService = require('../integrations/google/drive.service');

class ResourcesManager {

  /**
   * Scan inbox for pending client resources
   * Called by Mariana's monitoring cron
   */
  async checkForNewResources(pendingTasks = []) {
    if (!gmailService.isAvailable()) {
      console.log('[ResourcesManager] Gmail not configured — skipping check');
      return [];
    }

    const processed = [];

    for (const task of pendingTasks) {
      const query = `subject:"${task.subjectKeyword}" has:attachment is:unread`;
      const messages = await gmailService.searchEmails(query);

      for (const msg of messages) {
        const email = await gmailService.getMessage(msg.id);
        if (email.attachments && email.attachments.length > 0) {
          const result = await this.processClientResources(email, task);
          processed.push({ task, email, result });
          await gmailService.markAsRead(msg.id);
        }
      }
    }

    return processed;
  }

  /**
   * Process attachments from a client email into Drive
   */
  async processClientResources(email, task) {
    console.log(`[ResourcesManager] Processing ${email.attachments.length} attachments from ${email.from}`);

    // Ensure Drive folder structure
    const folders = await driveService.ensureProjectStructure(
      task.clientName || 'Cliente',
      task.projectName || 'Proyecto'
    );

    const categorized = this.categorizeResources(email.attachments);
    const uploaded = { logos: [], fotos: [], videos: [], docs: [] };

    for (const [category, files] of Object.entries(categorized)) {
      const targetFolder = folders[category] || folders.docs;
      if (!targetFolder) continue;

      for (const file of files) {
        try {
          const buffer = await gmailService.getAttachment(email.id, file.attachmentId);
          if (buffer) {
            const result = await driveService.uploadFile(
              file.name, buffer, file.mimeType, targetFolder.id,
              { received_from: email.from, task_id: task.id || '' }
            );
            uploaded[category]?.push({ name: file.name, driveId: result.id, url: result.url });
          }
        } catch (err) {
          console.error(`[ResourcesManager] Error uploading ${file.name}:`, err.message);
        }
      }
    }

    console.log(`[ResourcesManager] ✅ Resources organized in Drive: ${folders.resources.url}`);
    return { folders, uploaded, summary: this.summarizeUploaded(uploaded) };
  }

  /**
   * Categorize attachments by file type
   */
  categorizeResources(attachments) {
    const cats = { logos: [], fotos: [], videos: [], docs: [] };

    for (const file of attachments) {
      const ext = file.name.split('.').pop().toLowerCase();
      const nameLower = file.name.toLowerCase();

      if (['ai', 'eps', 'svg'].includes(ext)) {
        cats.logos.push(file);
      } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'heic'].includes(ext)) {
        if (nameLower.includes('logo') || nameLower.includes('marca') || nameLower.includes('brand')) {
          cats.logos.push(file);
        } else {
          cats.fotos.push(file);
        }
      } else if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) {
        cats.videos.push(file);
      } else {
        cats.docs.push(file);
      }
    }

    return cats;
  }

  /**
   * Build resource request message for Mariana to send to client
   */
  buildResourceRequestMessage(projectName, clientName, resourcesNeeded) {
    const subject = `${clientName} - ${projectName}`;
    return {
      message: `Para hacer tu ${projectName} de la mejor manera, necesito algunos materiales:

📎 *RECURSOS QUE NECESITO:*
${resourcesNeeded.map(r => `• ${r}`).join('\n')}

📧 *ENVÍALOS A:*
proyectosfractalmx@gmail.com

📝 *EN EL ASUNTO:*
"${subject}"

Eso me ayuda a tener todo organizado y asegurarme de que el equipo tenga exactamente lo que necesita 🚀

¿Cuándo crees que puedas mandarlos?`,
      expectedSubjectKeyword: subject,
      email: 'proyectosfractalmx@gmail.com'
    };
  }

  summarizeUploaded(uploaded) {
    const total = Object.values(uploaded).flat().length;
    const parts = Object.entries(uploaded)
      .filter(([, files]) => files.length > 0)
      .map(([cat, files]) => `${files.length} ${cat}`);
    return `${total} archivo(s) subido(s): ${parts.join(', ')}`;
  }
}

module.exports = new ResourcesManager();
