# Gorest-AliceinBorderland

**弥留之国 · BORDERLAND**, a browser-playable Alice in Borderland tribute by [Gorest](https://gorest.ai).

![Borderland](docs/media/poster.jpg)

An abandoned Tokyo you can walk through in the browser, built with Three.js. It's a fan tribute to *Alice in Borderland*
(今際の国のアリス). The city is empty and card airships drift overhead. Across the districts are the deadly game venues
from the show, and one of them (♦4 「電球」 Light Bulb) is fully playable.

一座可以在浏览器里漫游的空城东京（Three.js），致敬《弥留之国的爱丽丝》。人去城空，飞艇挂着扑克牌在天上巡游，
各个街区散布着剧中的死亡游戏场地，其中 ♦4「电灯泡」可以完整游玩。

| | |
|---|---|
| ![♦4 Light Bulb](docs/media/bulb.jpg) | ![The beams](docs/media/beams.jpg) |
| ![♥Q rooftop garden](docs/media/hearts.jpg) | ![The hunt](docs/media/hunt.jpg) |

## What's in it

- **A compressed Tokyo (~2.9 × 1.7 km):**
  - The real building footprints around Shibuya and Tokyo Tower come from Japan's open 3D city data,
    [Project PLATEAU](https://www.mlit.go.jp/plateau/).
  - Two real models are walkable: the underground mall beneath the Shibuya scramble, and the Port City Takeshiba
    interior.
  - Overgrown streets, abandoned cars, crows by day, and day → dusk → night lighting.
- **Game venues:** the night compound with the Q♥ card tower, the ♦K courtroom at the top of a tower, the ♣ black
  warehouse with its beams over fog pits, the ♣ tower's rooftop venue, the ♥Q croquet garden, the Shibuya hunt, the
  prison and the burning district.
- **Playable ♦4 「電球」:**
  - Walk into the underground storm-water tank and the shutter seals behind you.
  - The floor floods. Three breakers, one bulb behind a 開閉自由 door; find the right one before the water reaches
    the electrodes.
- **Rendering:**
  - Post-processing: GTAO, bloom, depth of field, screen-space sun shafts and a teal/amber film grade.
  - Height fog and procedural trees.
  - A lite mode for integrated GPUs.

## Run it

```bash
npm ci
npm run dev
```

Open http://localhost:8765, pick a district from the list, and press ▶ to walk around: WASD to move, Shift to run,
Space to jump, V to switch to first person. On Windows, `tools/launch.ps1` starts the server and opens the city in
your browser.

## Spatial Review

This branch adds a dedicated, frozen representation of the city for spatial feedback with
[Alterno Spatial Review](https://spatial-review.alterno.dev). Start the local server as above, then
open [Spatial Review for the local website](https://spatial-review.alterno.dev/review?site=http%3A%2F%2Flocalhost%3A8765%2F).
Keep the server running while reviewing; your browser may ask permission to access localhost.

**Acceptance status:** capture, geometry, texture, placement, build and ordinary-game checks pass.
The hosted editor's full UI remains unverified: the software-rendered test browser hit its
preparation deadline at 221 of 920 assets, with all received asset responses successful. Scene,
Asset, Experience and feedback-export interactions still need acceptance in a browser with
hardware acceleration. See the integration plan below for the measured results and limitation.

The ordinary website is `http://localhost:8765/`. Its static discovery document is
`http://localhost:8765/.well-known/spatial-review.json`, and its capture document is
`http://localhost:8765/spatial-review.html`. The capture page also generates an editor link for
the actual server address using the SDK's `spatialReviewEditorUrl()` helper. When entering a website
address in the editor, use the ordinary website URL so discovery selects the capture document.

The capture reuses the game's construction code and records every prop and tree from its source
placement, independently of the game's camera culling. To fit the editor's 5,000-actor limit,
the largest repeated sets are grouped by authored zone and design; smaller sets share their canonical
asset as ordinary actors. Groups retain stable instance IDs;
one actual placement of each design keeps its separate canonical Asset view. The editor prepares compact geometry overviews first and requests textured detail on demand. Group transforms affect the complete group; instance annotations identify
individual members. Merged procedural environment surfaces retain their existing coarse construction
boundaries. The 18 authored trailer shots are available in Experience. Shader effects, gameplay, and animation have
the limits listed in the [integration plan](docs/spatial-review-integration-plan.md), which also records
the verification status and source mappings.

The official editor origin is explicitly enabled. It can receive registered geometry, materials,
textures, and source references through the capture page. Review changes are proposals: export feedback,
apply it to the referenced source, then refresh the review to check the result.

```bash
npm test            # syntax checks for game, capture, and build modules
npm run build       # prepare dist/, including runtime models, textures, dependencies, and discovery
```

The static build supports serving from a project subdirectory. For a host mounting the export at
`/gorest-aliceinborderland/`, run `SPATIAL_REVIEW_BASE_PATH=/gorest-aliceinborderland npm run build`
to generate matching framing and CORS paths in `_headers`. Hosts that do not read `_headers` need
the equivalent response headers configured separately. Building prepares the files locally; hosting
is configured separately. The ordinary game page does not load the review SDK.

## The trailer

Every shot in the trailer is recorded in the engine; nothing is filmed or composited from outside footage. The music
and sound design are synthesised in code, with no samples. All of it is reproducible from `trailer/`:

```bash
bash trailer/render.sh       # headless Chrome on the GPU, virtual clock, frame-by-frame capture of every shot
python trailer/music.py      # procedural score synced to the cut (trailer/edl.py)
python trailer/edit.py       # assemble picture, titles and card flashes; mux with ffmpeg
```

The game server has to be running for `render.sh`. The recorder steps the game frame by frame over the Chrome
DevTools protocol, so render speed never affects smoothness.

## Credits and license

- **Code:** MIT.
- **Assets (card paintings, models):** CC BY 4.0.
- **PLATEAU city data:** © MLIT Japan, used with attribution.

See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md). This is an unofficial fan project, not affiliated with Netflix,
ROBOT or Haro Aso.
