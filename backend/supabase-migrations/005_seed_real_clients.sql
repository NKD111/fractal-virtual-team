-- 005_seed_real_clients.sql
-- Fase 8.5 PASO 1: insert real client + project data so the agents have
-- concrete context. Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO clients (name, contact_name, whatsapp, phone, industry, special_conditions, notes, is_active)
VALUES
  ('Vanexpo', 'Luis Manuel Díaz', '+525571088283', '+525571088283',
   'eventos_expos', 'unlimited_revisions',
   'Cliente principal. Organizan FIF, Expo Tendero, Expo Eléctrica. Sin límite de cambios.', true),
  ('Central Interactiva', 'Julio Bojórquez', '+525571746036', '+525571746036',
   'produccion_audiovisual', 'payment_wednesday',
   'Pago los miércoles. 15-20 cambios técnicos por proyecto. Contactos: Claudia González +525525420371, Angie +525534141550', true),
  ('Centro Convenciones Morelos', 'Pepe Saavedra', '+525610213681', '+525610213681',
   'centro_convenciones', NULL,
   'Cliente desde mayo 2026. $15k MXN/mes. 2 rondas de revisión.', true)
ON CONFLICT (whatsapp) DO NOTHING;

INSERT INTO users (name, whatsapp, phone, first_channel, first_seen_at)
VALUES
  ('Luis Manuel Díaz - Vanexpo',         '+525571088283', '+525571088283', 'whatsapp', NOW()),
  ('Julio Bojórquez - Central Interactiva','+525571746036', '+525571746036', 'whatsapp', NOW()),
  ('Pepe Saavedra - Centro Convenciones', '+525610213681', '+525610213681', 'whatsapp', NOW())
ON CONFLICT (whatsapp) DO NOTHING;

-- Sample projects (only inserts if no existing project with the same name for that client)
INSERT INTO projects (name, client_id, status, description, deadline)
SELECT 'Video Institucional FIF 2025', id, 'in_production',
       'Video principal para Feria Internacional de Franquicias 2025. Slogan: Encuentra tu próximo negocio.',
       NOW() + INTERVAL '15 days'
FROM clients WHERE name = 'Vanexpo'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Video Institucional FIF 2025');

INSERT INTO projects (name, client_id, status, description, deadline)
SELECT 'Pack Redes Sociales Q2', id, 'in_review',
       'Contenido para redes sociales del segundo trimestre. Videos cortos + stories.',
       NOW() + INTERVAL '7 days'
FROM clients WHERE name = 'Central Interactiva'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Pack Redes Sociales Q2');

INSERT INTO projects (name, client_id, status, description, deadline)
SELECT 'Branding Digital Mayo', id, 'briefing',
       'Estrategia de contenido digital para mayo. Incluye diseño de materiales.',
       NOW() + INTERVAL '21 days'
FROM clients WHERE name = 'Centro Convenciones Morelos'
  AND NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Branding Digital Mayo');
