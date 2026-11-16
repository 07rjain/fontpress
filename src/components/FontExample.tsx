export function FontExample() {
  return <section className="fest-example" aria-labelledby="example-title">
    <header className="fest-head">
      <p className="eyebrow">From drawing to type</p>
      <h2 id="example-title">Your marks become font outlines.</h2>
      <p className="lede">Fontpress traces your drawings into shapes a font can use. These three sample characters show the same process used for your finished font.</p>
    </header>
    <div className="example-grid">
      <figure><img src="/examples/drawn-characters.png" width="900" height="300" loading="lazy" alt="The sample characters H, i and an exclamation mark drawn with rounded pen strokes." /><figcaption>1. Draw your characters</figcaption></figure>
      <figure><img src="/examples/traced-characters.svg" width="900" height="300" loading="lazy" alt="The same H, i and exclamation mark rendered from the exported font outlines." /><figcaption>2. Fontpress traces them into type</figcaption></figure>
    </div>
    <p className="meta">Illustrative three-character sample generated with Fontpress. Complete all 85 characters to download your own font.</p>
  </section>;
}
