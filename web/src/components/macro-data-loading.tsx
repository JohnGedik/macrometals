export function MacroDataLoading({ message, className = "" }: { message: string; className?: string }) {
  return (
    <section className={`home-macro-scores-loading ${className}`.trim()} role="status" aria-live="polite">
      <div className="macro-loading-copy">
        <span className="macro-loading-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <strong>{message}</strong>
      </div>
      <div className="macro-loading-bars" aria-hidden="true">
        <span className="macro-loading-bar macro-loading-bar-gold" />
        <span className="macro-loading-bar macro-loading-bar-silver" />
        <span className="macro-loading-bar macro-loading-bar-copper" />
        <span className="macro-loading-bar macro-loading-bar-oil" />
      </div>
    </section>
  );
}
