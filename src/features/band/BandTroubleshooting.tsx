/** Recovery steps for the band connection, including the known iPhone Garmin Connect conflict. */
export function BandTroubleshooting({ onShowAll }: { onShowAll: () => void }) {
  return (
    <details className="rounded-control border border-[var(--border-panel)] p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Connection trouble?</summary>
      <div className="mt-2 flex flex-col gap-3 text-[var(--text-secondary)]">
        <div>
          <p className="font-medium text-[var(--text-primary)]">Band missing, or connecting fails (iPhone)</p>
          <p>
            The Garmin Connect app can hold the band so other apps can't reach it. What fixed it for us: open <b>Settings → Bluetooth</b>, tap ⓘ next
            to the band (it may show as <b>Garmin Device</b>), and under <b>Apps allowed to connect</b> turn <b>Connect</b> off. Leave <b>Bluefy</b> on.
            Then connect here again.
          </p>
          <p className="mt-1">
            Going back to Garmin Connect later: turn <b>Connect</b> back on in the same place, then open the Garmin Connect app so it can sync. Don't
            unpair, forget or reset the band for this.
          </p>
        </div>
        <div>
          <p className="font-medium text-[var(--text-primary)]">Other things to try</p>
          <ul className="ml-4 list-disc">
            <li>Keep the band within a metre or two of the phone during a sync.</li>
            <li>Make sure Bluetooth is on and Bluefy is allowed to use it (Settings → Bluefy → Bluetooth).</li>
            <li>Close and reopen the BetterGarmin tab, then tap Connect.</li>
            <li>If a download stopped part-way, just sync again: finished files are kept and skipped, and the rest resume.</li>
          </ul>
        </div>
        <button type="button" className="self-start text-[var(--accent)] underline" onClick={onShowAll}>
          Show all Bluetooth devices
        </button>
      </div>
    </details>
  )
}
