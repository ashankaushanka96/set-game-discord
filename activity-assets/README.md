# SET GAME — Discord Activity assets

Upload these files in the Activity asset settings shown in your screenshot:

| Setting | File | Dimensions | Limit |
|---|---|---|---|
| App Icon (General Information) | app-icon.png | 1024 × 1024 | Under 10 MB |
| Background | background.png | 1024 × 576 | Under 10 MB |
| Cover Art | cover-art.png | 1024 × 576 | Under 10 MB |
| Video Preview | video-preview.mp4 | 640 × 360 | 10 seconds, under 0.5 MB |

The background has no title and keeps its middle clear for Discord's interface.
The cover retains the activity name SET GAME and matches the emerald/gold card-club style.
The silent H.264 MP4 is an animated promotional illustration of the card-passing, collecting, and round-win flow; it is not a recording of a live multiplayer session.
The exact video size is 382,029 bytes. video-poster.png is an optional still, not a required upload.

## Rebuilding the animation (macOS)

The source is source/build-media.swift. It uses the native macOS graphics and video encoders, with no additional packages. Run from the project root and choose a fresh output folder:

```sh
swiftc -module-cache-path /tmp/set-game-swift-cache activity-assets/source/build-media.swift -o /tmp/set-game-build-media
/tmp/set-game-build-media activity-assets/cover-art.png activity-assets/background.png /tmp/set-game-new-export
```

The video encoder may require execution outside a sandbox. The builder validates the MP4 file size and exports sample frames for visual verification.
