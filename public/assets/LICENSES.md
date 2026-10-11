# Third-party assets

Every file under `public/assets/` comes from a CC0 (public domain) source. No
attribution is legally required, but we credit the authors gladly. Files were
downloaded from the sources below and re-encoded for the web by
`tools/build-assets.py` (WebP textures at 1K/2K/4K, Radiance `.hdr` for lighting,
8-bit JPEG strips of the upper hemisphere for the visible sky). The manifest the
game uses is `src/render/assets.ts`.

License for all entries: **CC0 1.0 Universal** — https://creativecommons.org/publicdomain/zero/1.0/

## PBR textures (`textures/<key>/{albedo,normal,arm}_<res>.webp`)

`arm` packs ambient occlusion (R), roughness (G) and metalness (B). Normal maps use
the OpenGL (+Y) convention.

| Key | Asset | Source URL | Author(s) | License | Resolutions |
| --- | --- | --- | --- | --- | --- |
| asphalt_fresh | Asphalt Pit Lane | https://polyhaven.com/a/asphalt_pit_lane | Dimitrios Savva | CC0 | 1K, 2K, 4K |
| asphalt_worn | Asphalt 02 | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | CC0 | 1K, 2K |
| gravel | Gravel Floor 02 | https://polyhaven.com/a/gravel_floor_02 | Jenelle van Heerden, Dimitrios Savva | CC0 | 1K, 2K |
| concrete | Concrete Wall 008 | https://polyhaven.com/a/concrete_wall_008 | Dario Barresi, Charlotte Baglioni | CC0 | 1K, 2K |
| guardrail | Metal 050 C | https://ambientcg.com/a/Metal050C | ambientCG (Lennart Demes) | CC0 | 1K |
| grass | Leafy Grass | https://polyhaven.com/a/leafy_grass | Charlotte Baglioni | CC0 | 1K, 2K |
| sand | Red Sand | https://polyhaven.com/a/red_sand | Rohit Seervi | CC0 | 1K, 2K |
| rock | Rock Face 03 | https://polyhaven.com/a/rock_face_03 | Dario Barresi, Rico Cilliers | CC0 | 1K, 2K |
| snow | Snow 02 | https://polyhaven.com/a/snow_02 | Rob Tuytel | CC0 | 1K, 2K |
| forest | Forest Leaves 04 | https://polyhaven.com/a/forest_leaves_04 | Rob Tuytel | CC0 | 1K, 2K |
| pavement | Concrete Pavement | https://polyhaven.com/a/concrete_pavement | Charlotte Baglioni | CC0 | 1K, 2K |
| facade_city | Facade 020 A | https://ambientcg.com/a/Facade020A | ambientCG (Lennart Demes) | CC0 | 1K, 2K |
| facade_industrial | Corrugated Iron 02 | https://polyhaven.com/a/corrugated_iron_02 | Jenelle van Heerden, Sergej Majboroda | CC0 | 1K |
| bark | Bark Brown 02 | https://polyhaven.com/a/bark_brown_02 | Rob Tuytel | CC0 | 1K |

## HDR environments (`hdri/<key>_1k.hdr`, `sky/<key>_{2k,4k}.jpg`)

| Key | Asset | Source URL | Author(s) | License | Used for |
| --- | --- | --- | --- | --- | --- |
| dawn | Syferfontein 0d Clear (Pure Sky) | https://polyhaven.com/a/syferfontein_0d_clear_puresky | Greg Zaal, Jarod Guest | CC0 | lighting + sky |
| day | Kloofendal 43d Clear (Pure Sky) | https://polyhaven.com/a/kloofendal_43d_clear_puresky | Greg Zaal | CC0 | lighting + sky |
| cloudy | Kloofendal 48d Partly Cloudy (Pure Sky) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | CC0 | lighting + sky |
| overcast | Kloofendal Overcast (Pure Sky) | https://polyhaven.com/a/kloofendal_overcast_puresky | Greg Zaal | CC0 | lighting + sky |
| fog | Kloofendal Misty Morning (Pure Sky) | https://polyhaven.com/a/kloofendal_misty_morning_puresky | Greg Zaal | CC0 | lighting + sky |
| sunset | Belfast Sunset (Pure Sky) | https://polyhaven.com/a/belfast_sunset_puresky | Greg Zaal, Dimitrios Savva, Jarod Guest | CC0 | lighting + sky |
| night | Kloppenheim 02 (Pure Sky) | https://polyhaven.com/a/kloppenheim_02_puresky | Greg Zaal, Jarod Guest | CC0 | lighting + sky |
| city_night | Shanghai Bund | https://polyhaven.com/a/shanghai_bund | Greg Zaal | CC0 | lighting only (city at night) |
