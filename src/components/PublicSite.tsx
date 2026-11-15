import { useState } from 'react';
import { Landing } from './Landing';
import { Gallery } from './Gallery';
import { fetchFontFile, type SavedFont } from '../api';
import type { PublicPath } from '../seo';

const openStudio = (mode: string) => window.location.assign(`/#/${mode}`);

export function PublicSite({ path }: { path: PublicPath }) {
  const [downloadError, setDownloadError] = useState('');
  async function download(font: SavedFont) {
    setDownloadError('');
    try {
      const [buffer, { saveFontFile }] = await Promise.all([fetchFontFile(font, undefined, true), import('../font')]);
      saveFontFile(buffer, font.name);
    } catch (error) { setDownloadError(error instanceof Error ? error.message : 'Could not download that font. Please try again.'); }
  }
  return <div className="app home public-site">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Handpress home"><span className="brand-mark" aria-hidden="true">H</span><span className="brand-name">Handpress</span></a>
      <nav className="tabs public-nav" aria-label="Sections">
        <a className="tab" href="/#how-it-works">How it works</a>
        <a className="tab" href="/handwriting-template" aria-current={path === '/handwriting-template' ? 'page' : undefined}>Template guide</a>
        <a className="tab" href="/gallery" aria-current={path === '/gallery' ? 'page' : undefined}>Gallery</a>
      </nav>
      <div className="top-actions"><a className="primary" href="/#/draw">Create my font</a></div>
    </header>
    <main id="main-content">
      {path === '/' ? <Landing signedIn={false} filled={0} familyName="" covered={new Set()}
        onDraw={() => openStudio('draw')} onTemplate={() => openStudio('template')} onUpload={() => openStudio('template')}
        onSpecimen={() => openStudio('specimen')} onGallery={() => window.location.assign('/gallery')}
        onDownload={(font) => void download(font)} />
        : path === '/gallery' ? <div className="public-gallery"><Gallery onDownload={(font) => void download(font)} onStart={() => openStudio('draw')} /></div>
          : <FontGuide path={path} />}
      {downloadError && <p className="public-download-error" role="alert">{downloadError}</p>}
    </main>
    <noscript><p className="noscript-message">The drawing studio needs JavaScript. You can still read the handwriting and installation guides.</p></noscript>
  </div>;
}

function FontGuide({ path }: { path: '/handwriting-template' | '/install-font' }) {
  const template = path === '/handwriting-template';
  return <article className="font-guide">
    <nav className="guide-links" aria-label="Breadcrumb"><a href="/">Handpress</a><span aria-current="page">{template ? 'Handwriting template' : 'Install your font'}</span></nav>
    <p className="eyebrow">{template ? 'The drawing tent' : 'The print shop'}</p>
    <h1>{template ? 'Make a font with the handwriting template' : 'Install your handwriting font on Mac or Windows'}</h1>
    <p className="lede">{template ? 'Prefer pen and paper? Print our two-page template, write your characters, then photograph each page to bring your handwriting into Handpress.' : 'Your finished Handpress font is an OpenType (.otf) file. Install it on your computer, then select it by name in an app that supports installed fonts.'}</p>
    {template ? <>
      <section><h2>1. Print both template pages</h2><p>Create a free account or sign in, open Template in the studio, and choose Print both pages. Use clear white paper and check that the four corner squares and the extra marker on page two are printed in full.</p><a href="/#/template" className="primary">Open the printable template</a></section>
      <section><h2>2. Write all 85 characters</h2><p>Use a black pen. Write each letter, number and punctuation mark in its matching cell, keeping the bottom of each character on the blue baseline. Stay inside the guides and leave all printed black squares unobstructed. The template supports English capitals, lowercase letters, digits and selected punctuation.</p></section>
      <section><h2>3. Photograph one page at a time</h2><p>Lay the paper flat in even light. Include all four corner squares and avoid shadows, glare and blur. Upload each photographed page from Template in the studio. Follow the alignment screen to match the page corners before extracting your characters.</p><p>Your photo is processed in your browser. Saving a project uploads the extracted editable drawings and generated font to your account; it does not upload the original photograph.</p></section>
      <section><h2>4. Check the result in Preview</h2><p>Look for missing marks or clipped letters and redraw any characters that need attention. Type a sentence and adjust spacing. You can save unfinished work privately; all 85 characters need usable outlines before downloading or publishing the font.</p><p>If a page is hard to read, take another photo in better light. You can also draw in the browser or import an individual letter instead of using a photographed template.</p></section>
    </> : <>
      <section><h2>Download your completed font</h2><p>Finish all 85 characters in Handpress, open Preview, give your font a recognizable name, and choose Download. Your file should have one .otf extension. A saved private draft can be unfinished, but a font download requires every supported character to have a usable outline.</p></section>
      <section><h2>Install on a Mac</h2><ol><li>Find the downloaded .otf file in Finder and double-click it.</li><li>Font Book opens a preview. Choose the install option and follow any validation prompts.</li><li>Open an app that supports installed fonts and look for the font name you chose in Handpress.</li></ol><p>You can also open Font Book and add the file from its File menu. If the font does not appear in an already-open app, quit and reopen that app.</p></section>
      <section><h2>Install on Windows</h2><ol><li>Find the .otf file in File Explorer and double-click it.</li><li>Choose Install in the font preview, or right-click the file and use its install option.</li><li>Reopen your writing or design app and select your font by its Handpress name.</li></ol><p>On managed computers, your organization may restrict font installation. Some web apps and devices do not use locally installed fonts and may require a separate upload or their own font support.</p></section>
      <section><h2>If a letter looks different or is missing</h2><p>Check that your text uses supported English letters, digits and punctuation. Accented letters and other unsupported characters may be shown in a fallback font. Return to Handpress to edit any supported character, download the revised font, and replace the older installation.</p><p>Handpress currently has no kerning or ligature controls. Check the font in your intended app before using it in a final document.</p></section>
    </>}
    <nav className="guide-links" aria-label="Next steps"><a href="/#/draw">Create your handwriting font</a><a href={template ? '/install-font' : '/handwriting-template'}>{template ? 'How to install your finished font' : 'Use the handwriting template'}</a><a href="/#faq">Common questions</a></nav>
    <footer className="guide-footer"><p>Need help? <a href="mailto:07rishabhjain@gmail.com">Email Handpress</a>.</p></footer>
  </article>;
}
