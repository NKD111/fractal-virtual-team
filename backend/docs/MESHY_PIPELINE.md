# Meshy Image-to-3D Pipeline

Status: **Armed (code ready) but inactive until `MESHY_API_KEY` is set.**

The pipeline turns reference images of each agent into rigged 3D GLB models that
the frontend then uses in place of `VoxelHumanoid`. The frontend automatically
prefers a Meshy GLB if one exists for an agent (`/api/meshy/asset/:slug` returns
`200`); otherwise it falls back to the procedural voxel humanoid.

## Setup (when ready)

1. Create an account at <https://www.meshy.ai> and grab the API key.
2. Add to Railway env:
   ```
   MESHY_API_KEY=msk-xxxxxxxxxxxxxxxx
   ```
3. (Optional) Create a Supabase Storage bucket named `meshy-models` for caching.
   Without it, the backend returns Meshy's signed URLs directly (~24h validity).
4. Restart the backend. Confirm:
   ```
   curl https://fractal-virtual-team-production.up.railway.app/api/meshy/status
   → { "armed": true, "api_base": "...", "last_error": null }
   ```

## Generate one agent

```bash
# Submit
curl -X POST $BACKEND/api/meshy/full \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://your.cdn/mariana-portrait.png","agentSlug":"mariana","style":"cartoon"}'
# → blocks ~1-3 minutes, returns { task_id, glb_url }
```

Or split the steps:

```bash
# 1. Submit
curl -X POST $BACKEND/api/meshy/generate \
  -d '{"imageUrl":"...","agentSlug":"mariana"}'
# → { task_id }

# 2. Poll
curl $BACKEND/api/meshy/task/<task_id>
# → { status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED', model_urls?: { glb, fbx, usdz } }

# 3. Cache
curl -X POST $BACKEND/api/meshy/download \
  -d '{"taskId":"...","agentSlug":"mariana"}'
# → { glb_url, cached }
```

## Generate all 11 agents at once

After uploading reference images for each agent (one image per agent, ideally
front-facing portrait, transparent background works best), run:

```bash
for slug in mariana diana alex carlos sofia lucas diego max valentina roberto qcbot; do
  curl -X POST $BACKEND/api/meshy/full \
    -H "Content-Type: application/json" \
    -d "{\"imageUrl\":\"https://your.cdn/${slug}.png\",\"agentSlug\":\"${slug}\",\"style\":\"cartoon\"}" &
done
wait
```

The frontend will auto-pick up the new GLBs on next page load.

## Cost / time

- Meshy v2 image-to-3d: ~$0.10-0.30 per model, 1-3 minutes generation.
- 11 agents = ~$2-3 USD total.
- GLBs are cached in Supabase Storage (or returned via signed URLs) so each
  agent only generates once.

## Tuning per-agent

If a specific agent's GLB renders too tall/short or facing the wrong way,
edit `frontend/office/agents/HumanoidGLB.js` → `TUNING_OVERRIDES`:

```javascript
const TUNING_OVERRIDES = {
  carlos: { scale: 0.95, yOffset: 0, rotY: Math.PI },
  diego:  { scale: 1.05 }
};
```

## Pipeline files

- `backend/src/meshy/MeshyPipeline.js` — class with generateModel/poll/download
- `backend/src/routes/meshy.js` — REST endpoints
- `frontend/office/agents/HumanoidGLB.js` — `buildAgentMesh(slug, preset)`
- DB: `meshy_jobs` table tracks every task + final URLs
