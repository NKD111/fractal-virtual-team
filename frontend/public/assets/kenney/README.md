# Kenney Furniture Kit — Asset Drop Folder

The Office Scene loads these GLB files at runtime. **License: CC0 (public domain).**

## Quick install

1. Download the **Furniture Kit** pack (CC0):
   <https://kenney.nl/assets/furniture-kit>
2. Unzip. Inside the pack you'll find a `Models/GLTF format/` folder.
3. Copy the GLB files listed below into this directory (`frontend/public/assets/kenney/`).

If a file is missing, the office still renders — it falls back to a procedural box/cylinder
that looks reasonable. Expected filenames (Kenney uses these names exactly):

```
deskCorner.glb
desk.glb
chairDesk.glb
chairModernCushion.glb
computerScreen.glb
computer.glb
laptop.glb
lampSquare.glb
lampRoundFloor.glb
bookshelfWide.glb
plantSmall1.glb
plantTall.glb
rugRectangle.glb
cabinetTelevisionDoors.glb
trashcan.glb
binBag.glb
```

## Other Kenney packs that work

- **Prototype Kit** — modular walls/floors for room-building
- **Mini-Office** — alternative isometric office set
- **Mini-Characters Kit** — already-rigged character GLBs as alternative to VoxelHumanoid

The `AssetLoader` resolves names through a logical map in
`frontend/office/world/AssetLoader.js` (see `KENNEY_ASSETS`). Update the
filename strings there if you swap to a different pack.
