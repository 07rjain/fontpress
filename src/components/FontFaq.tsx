export const FONT_FAQS = [
  ['Is Handpress free? Do I need an account?', 'Handpress is free to use. Create an account to draw, import a template, and save your work. You can read these guides and browse public fonts without signing in.'],
  ['Why do I need to finish all 85 characters?', 'A download needs all 85 supported characters to produce usable outlines. You can preview your font as you draw and save an unfinished font privately, then return to complete it. Publishing also requires all 85 characters.'],
  ['Which characters and languages are supported?', 'The character set includes English uppercase and lowercase letters, numbers, and selected punctuation. Handpress does not currently provide accented letters, wider language coverage, ligatures, or kerning controls.'],
  ['Can I save an unfinished font?', 'Yes. After drawing at least one usable character, open Preview and choose Save privately. Your account copy includes the font and editable drawings. Local drafts also stay in this browser; clearing site data removes those local copies.'],
  ['Are my drawings and fonts private?', 'Drawing and tracing happen in your browser. Saving uploads your font and editable drawings to your account. They stay private unless you publish the font. Publishing lets anyone download the font; the editable source remains owner-only.'],
  ['What file do I download?', 'Your completed font downloads as an OpenType file with a single .otf extension. Install it with Font Book on Mac or the font installer on Windows, then use it in apps that support installed fonts.'],
  ['Can I use a gallery font commercially?', 'A public download does not by itself establish a commercial-use license. Check permission with its designer before commercial use or redistribution.'],
] as const;

export function FontFaq() {
  return <section id="faq" className="fest-faq" aria-labelledby="faq-title">
    <header className="fest-head"><p className="eyebrow">Before you start</p><h2 id="faq-title">Questions about your handwriting font</h2></header>
    <div className="faq-list">{FONT_FAQS.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
    <nav className="guide-links" aria-label="Font guides"><a href="/handwriting-template">Print and photograph the handwriting template</a><a href="/install-font">Install your font on Mac or Windows</a></nav>
  </section>;
}
