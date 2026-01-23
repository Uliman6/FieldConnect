# Required Assets for App Build

Before building the app, you need to create these image files:

## Required Files

### 1. icon.png (1024x1024)
- App icon displayed on home screen
- Should be a square PNG, no transparency for iOS
- Recommendation: Orange background with FieldConnect logo

### 2. adaptive-icon.png (1024x1024)
- Android adaptive icon foreground
- Should have transparent background
- The actual icon content should be centered in the safe zone (inner 66%)

### 3. splash-icon.png (1284x2778 or similar)
- Splash screen shown while app loads
- Can be a simple centered logo
- Background color is set to #F97316 (orange) in app.json

### 4. favicon.png (48x48)
- Web browser favicon
- Small square icon

## Quick Start (Placeholder)

For quick testing, you can use any 1024x1024 PNG as icon.png and adaptive-icon.png.
The build will work, you can replace with proper branding later.

## Tools to Create Icons

- Figma (free): https://figma.com
- Canva (free): https://canva.com
- Icon Kitchen: https://icon.kitchen (generates all sizes automatically)
