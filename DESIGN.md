---
name: Online Image Compression
description: Homepage upload workspace, documented from the implementation
colors:
  ground: '#edf0f2'
  surface: '#ffffff'
  well: '#f7f9fa'
  ink: '#25282c'
  muted: '#5e656b'
  edge: '#dfe4e7'
  control: '#a5afb6'
  accent: '#bd2458'
  accent-hover: '#a81c4c'
  focus: '#167a72'
typography:
  title:
    fontFamily: 'Arial, Microsoft YaHei, sans-serif'
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: '0'
  body:
    fontFamily: 'Arial, Microsoft YaHei, sans-serif'
    fontSize: '16px'
    lineHeight: 1.5
  secondary:
    fontSize: '14px'
rounded:
  control: '6px'
  well: '8px'
spacing:
  compact: '8px'
  standard: '16px'
  section: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '14px 28px'
    height: '56px'
---

# Design System: Online Image Compression

## Overview

**Creative North Star: "The Image Workspace"**

This is an Operate surface: the first screen starts a real compression task.
Scope is the homepage only; the existing editor and batch views retain their own controls.
The existing compression logo and magenta action color remain the identity.

## Colors

Neutral framing separates the header, white work surface and image selection well.
Magenta identifies the primary action; teal identifies keyboard focus.
Source of truth: `src/shared/prerendered-app/Intro/style.css`.

## Typography

One installed sans-serif stack, fixed sizes and zero tracking.
The title changes to 20px below 600px. Secondary labels use the secondary role;
buttons and section titles use the body role. No downloaded font.

## Layout

A header precedes a full work surface, not a landing-page hero.
The centered workspace is capped at 720px. Its three examples use equal columns,
with 16px gutters. Below 600px, gutters become 8px and thumbnails stack over labels.
The narrow layout uses 16px outer padding and safe-area insets.
Short screens scroll vertically; the primary action remains near the start.

## Elevation & Depth

Flat tonal separation, no resting shadows or decorative gradients.
The dashed selection boundary belongs to the interactive file-input area.

## Shapes

The selection area uses the well radius; controls use the control radius.
Image thumbnails use 3px corners and fixed dimensions to avoid layout shifts.

## Components

The entire selection well is one keyboard-accessible button; its inner action
label is a span, not a nested button. Mouse click or touch opens the file picker.
Examples are real project images, loaded only when selected, with disabled,
loading, failure, retry and cancellation states. Installation appears only when
the browser offers its existing install prompt.
Focus uses a 3px outline; hover is pointer-specific. Reduced motion removes
button travel while retaining color, border and focus feedback.

## Do's and Don'ts

- Do preserve single-image, batch and offline workflows.
- Do reuse the project's actual image assets and native file picker.
- Don't add clipboard controls or fabricated compression statistics.
- Don't introduce decorative animation, floating sections or new dependencies.
