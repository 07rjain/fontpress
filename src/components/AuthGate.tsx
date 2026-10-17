type Props = {
  onSignIn: () => void;
  onSignUp: () => void;
  onGallery: () => void;
};

export function AuthGate({ onSignIn, onSignUp, onGallery }: Props) {
  return (
    <div className="gate">
      <div className="gate-card">
        <span className="brand-mark big" aria-hidden="true">
          H
        </span>
        <h1>Sign in to make your font</h1>
        <p className="lede">
          An account keeps your letters separate from anyone else on this device, and lets you save finished fonts
          privately or publish them to the gallery.
        </p>
        <div className="row center">
          <button type="button" className="primary big" onClick={onSignUp}>
            Create an account
          </button>
          <button type="button" className="ghost big" onClick={onSignIn}>
            Sign in
          </button>
        </div>
        <button type="button" className="text-btn" onClick={onGallery}>
          Browse public fonts first
        </button>
      </div>
    </div>
  );
}
