# Unsilent Reader Store Listing

## Single Purpose

Unsilent Reader reads web pages aloud with AI-generated speech, word-level highlighting, and precise seeking controls.

## Short Description

AI read-aloud for web pages with word highlighting and precise seeking.

## Detailed Description

Unsilent Reader turns readable web pages into a focused read-aloud experience. It extracts article text from the current page, generates AI speech with the user's configured ElevenLabs API key or optional custom API host, and highlights words as they are spoken so readers can follow along. Users can choose from a named preset voice list, load their available ElevenLabs voices, or paste a voice ID manually.

The floating reader includes play and pause controls, section navigation, sentence seeking, word seeking, speed control, and a request inspector for debugging speech generation. If AI speech is temporarily unavailable, the reader can fall back to the browser's built-in speech engine.

## Permissions Justification

storage:
Stores the configured ElevenLabs voice ID, optional custom API host, local API key, and local speech cache metadata.

contextMenus:
Adds a page context menu item so users can start reading the current page.

activeTab:
Allows the popup and context menu action to start reading the active tab after user interaction.

host permission for https://api.elevenlabs.io/*:
Allows the extension background worker to request AI speech and load the user's available voice list from ElevenLabs when the user configures an ElevenLabs API key.

optional host permissions:
Allows users to grant access to their own custom API host when they configure one.

content scripts on all URLs:
Injects the floating read-aloud controls and word highlighting layer into readable web pages.

## Privacy Notes

Unsilent Reader sends extracted page text to ElevenLabs or the user's configured custom API host only when the user starts read-aloud. The extension stores settings, the user-provided ElevenLabs API key, and speech cache data locally in the browser.

## Review Notes

To test:

1. Install the uploaded extension package.
2. Open a readable article page.
3. Click the extension icon, enter an ElevenLabs API key, load voices, choose a voice, and save settings.
4. Choose "Read this page", or use the context menu item "Read page with Unsilent".
5. Confirm that the floating player appears, AI speech plays, words highlight during playback, and normal page scrolling remains available.
