export default function ShareLeaderboardBanner({ entryId, sharePublic, onChangeShare, disabled }) {
  if (entryId == null) return null;
  return (
    <div className="lb-share-banner" role="region" aria-label="Leaderboard sharing">
      <span className="lb-share-banner-label">Share this strategy anonymously on the leaderboard?</span>
      <label className="lb-share-toggle">
        <input
          type="checkbox"
          checked={sharePublic}
          disabled={disabled}
          onChange={(e) => onChangeShare(e.target.checked)}
        />
        <span className="lb-share-toggle-ui" aria-hidden />
      </label>
    </div>
  );
}
